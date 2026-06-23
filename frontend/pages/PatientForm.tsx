
import React, { useState, useEffect } from 'react';
import { Card, Input, Select, Button, Table } from '../components/UI';
import { Patient, UserRole, User } from '../types';
import { generateUHID, savePatient, getPatients, formatDate, getStoredAuth, getUsers, saveVisit, getPatientHistory, API_BASE_URL } from '../services/storage';
import { useNavigate } from 'react-router-dom';
import { Search, UserCheck, Clock, Calendar, MessageSquare } from 'lucide-react';
import { useMasterData } from '../MasterContext';
import { formatRegistrationMessage, sendWhatsAppMessage } from '../services/whatsapp';

export const PatientForm: React.FC = () => {
  const navigate = useNavigate();
  const { masterData, updateMasterData } = useMasterData();

  const ordinals = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // --- Master Data ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [doctorUsers, setDoctorUsers] = useState<User[]>([]);

  // --- Old Patient Search State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);

  // --- New Patient Form State ---
  const [formData, setFormData] = useState<Partial<Patient>>({
    date: new Date().toISOString().split('T')[0],
    userType: 'New',
    title: 'Mr',
    sex: 'Male',
    paymentBy: 'Self',
    referredBy: 'Self', // Default
    purposeOfVisit: 'Consultation', // Default
    idProofType: 'Aadhar Card',
    visitCount: 1, // Default 1st visit
    prescriptionHistory: [],
    state: '',
    city: '',
    taluka: '',
    email: '',
    middleName: '',
    idProofNumber: ''
  } as any);

  // Manual DOB Entry State
  const [dobDisplay, setDobDisplay] = useState('');

  // Derived city options based on selected state
  const [cityOptions, setCityOptions] = useState<{ value: string, label: string }[]>([]);
  const [talukaOptions, setTalukaOptions] = useState<string[]>([]);

  useEffect(() => {
    // Async Initialization
    const initData = async () => {
      setFormData(prev => ({ ...prev, uhid: generateUHID() }));

      try {
        const [pts, users] = await Promise.all([
          getPatients(),
          getUsers()
        ]);

        setAllPatients(pts);

        // Filter Doctors
        const docs = users.filter(u => u.role === UserRole.DOCTOR);
        setDoctorUsers(docs);
      } catch (error) {
        console.error("Failed to load initial data", error);
      }

      // Get Current User (Sync from LocalStorage wrapper but good to check)
      const user = getStoredAuth();
      setCurrentUser(user);

      // If Doctor, auto-fill name
      if (user && user.role === UserRole.DOCTOR) {
        setFormData(prev => ({ ...prev, consultantName: user.name }));
      }
    };

    initData();
  }, []);



  // Update city options when state changes
  useEffect(() => {
    if (formData.state && masterData.statesAndCities[formData.state]) {
      // Sort cities alphabetically for display
      const cities = masterData.statesAndCities[formData.state]
        .sort()
        .map(c => ({ value: c, label: c }));

      setCityOptions(cities);
    } else {
      setCityOptions([]);
    }
  }, [formData.state, masterData]);

  // Update taluka options when district (city) changes
  useEffect(() => {
    if (formData.city && masterData.districtsAndTalukas && masterData.districtsAndTalukas[formData.city]) {
      const talukas = [...masterData.districtsAndTalukas[formData.city]].sort();
      setTalukaOptions(talukas);
    } else {
      setTalukaOptions([]);
    }
  }, [formData.city, masterData]);

  // --- Search Logic (Real-time from Backend) ---
  useEffect(() => {
    const searchPatients = async () => {
      if (searchTerm.length > 2) {
        try {
          const response = await fetch(`${API_BASE_URL}/patients?search=${encodeURIComponent(searchTerm)}`);
          if (response.ok) {
            const results = await response.json();
            setSearchResults(results);
          }
        } catch (error) {
          console.error("Searching patients failed:", error);
        }
      } else {
        setSearchResults([]);
      }
    };

    const timeoutId = setTimeout(searchPatients, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Helper to check limit
  const checkPatientLimit = async (): Promise<boolean> => {
    if (!masterData) return false;

    // If Limit feature is disabled by Developer, return true (allow)
    if (masterData.enablePatientLimit === false) return true;

    // Use nullish coalescing to allow 0, but default to 100 if undefined
    const limit = masterData.totalPatientLimit ?? 100;

    // Get FRESH patient list to ensure we are checking against current state
    const currentPatients = await getPatients();

    // Calculate Total VISITS (sum of all visit counts), not just unique patients
    const totalVisits = currentPatients.reduce((acc, p) => acc + (p.visitCount || 1), 0);

    if (totalVisits >= limit) {
      alert(`System Usage Limit Reached (${totalVisits}/${limit} Total Visits).\n\nCannot process new registration or check-in.\nPlease contact administrator to upgrade your plan.`);
      return false;
    }
    return true;
  };

  const handleCheckInOldPatient = async (patient: Patient) => {
    // Check limit before allowing check-in
    const allowed = await checkPatientLimit();
    if (!allowed) return;

    // Enforce: Only 1 visit per patient per day
    // We check the VISITS TABLE directly (not patient.date) because patient.date
    // stays stale even after a visit is deleted, causing false-positive blocks.
    const today = new Date().toISOString().split('T')[0];
    const existingVisits = await getPatientHistory(patient.uhid);
    const hasTodayVisit = existingVisits.some((v) => v.date === today);
    if (hasTodayVisit) {
      alert(`⚠️ ${patient.firstName} ${patient.lastName} already has a visit registered for today (${formatDate(today)}).\n\nOnly 1 visit per patient is allowed on the same day. Multiple visits on the same date are not permitted.`);
      return;
    }

    const confirmCheckIn = window.confirm(`Check in ${patient.firstName} ${patient.lastName} for today? This will be Visit #${(patient.visitCount || 0) + 1}.`);

    if (confirmCheckIn) {
      try {
        const updatedPatient: Patient = {
          ...patient,
          date: today, // Update to today
          userType: 'Old',
          visitCount: (patient.visitCount || 0) + 1, // Increment Visit
          clinicalData: undefined, // CRITICAL FIX: Clear previous clinical data/medicines for new visit
          // If doctor is checking in, ensure they are set as consultant
          consultantName: currentUser?.role === UserRole.DOCTOR ? currentUser.name : patient.consultantName
        };

        const emptyClinicalData = {
          complaint: '', history: '', findings: '', investigation: '', diagnosis: '',
          actionPlan: '', treatment: '', advice: '', instruction: '',
          vitals: { bp: '', temp: '', spo2: '', pulse: '', height: '', weight: '', bmi: '' },
          prescriptions: [],
          printSettings: {}
        };

        // Sequential save to prevent race conditions with Foreign Keys
        await savePatient(updatedPatient);
        await saveVisit(updatedPatient.uhid, updatedPatient.date, updatedPatient.visitCount, emptyClinicalData);

        // WhatsApp Check-in Message
        const consultant = doctorUsers.find(d => d.name === updatedPatient.consultantName);
        const msg = formatRegistrationMessage({
          patientTitle: updatedPatient.title,
          patientName: `${updatedPatient.firstName} ${updatedPatient.lastName}`,
          clinicName: masterData?.clinicName || 'Clinic',
          uhid: updatedPatient.uhid,
          age: updatedPatient.age,
          sex: updatedPatient.sex,
          mobile: updatedPatient.mobile,
          address: updatedPatient.address,
          doctorName: updatedPatient.consultantName || 'Doctor',
          doctorDesignation: consultant?.designation || 'Consultant',
          visitDate: formatDate(updatedPatient.date),
          visitNo: ordinals(updatedPatient.visitCount) + " Visit",
          purpose: updatedPatient.purposeOfVisit || 'Consultation'
        });
        sendWhatsAppMessage(updatedPatient.mobile, msg);

        navigate('/dashboard');
      } catch (error: any) {
        console.error("Check-in failed:", error);
        alert(`Failed to check in patient: ${error.message}`);
      }
    }
  };

  // --- Form Logic ---
  const calculateAge = (dob: string) => {
    if (!dob) return;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    setFormData(prev => ({ ...prev, age }));
  };

  const calculateDobFromAge = (ageStr: string) => {
    const age = parseInt(ageStr);
    if (isNaN(age)) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const birthYear = currentYear - age;
    // Set to 01/01/Year as requested
    const dob = `${birthYear}-01-01`;

    setFormData(prev => ({ ...prev, age, birthDate: dob }));
    // Also update the display value for manual entry
    setDobDisplay(`01/01/${birthYear}`);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    // 1. Capitalize Names
    if (['firstName', 'middleName', 'lastName'].includes(name)) {
      newValue = value.toUpperCase();
    }

    // Capitalize District and Taluka inputs
    if (name === 'city' || name === 'taluka') {
      newValue = value.toUpperCase();
    }

    setFormData(prev => {
      const updated = { ...prev, [name]: newValue };

      // 2. Auto Gender Update
      if (name === 'title') {
        if (['Mr', 'Master', 'Shri'].includes(value)) updated.sex = 'Male';
        else if (['Mrs', 'Ms', 'Smt', 'Kumari', 'Miss.', 'Miss'].includes(value)) updated.sex = 'Female';
        // Dr and Baby can be either, so we preserve current or default
      }
      
      // Reset city and taluka if state changes
      if (name === 'state') {
        updated.city = '';
        updated.taluka = '';
      }

      return updated;
    });

    if (name === 'birthDate') {
      calculateAge(newValue);
    }
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    calculateDobFromAge(val);
  };

  // Special Handler for Mobile to enforce numbers only
  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only digits
    if (/[^0-9]/.test(val)) return;
    // Limit length to 10
    if (val.length > 10) return;

    setFormData(prev => ({ ...prev, mobile: val }));
  };

  // Handler for Manual DD/MM/YYYY Entry
  const handleManualDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Allow only numbers and /
    if (/[^0-9/]/.test(val)) return;

    // Auto-add slash logic
    if (val.length === 2 && dobDisplay.length === 1) val += '/';
    if (val.length === 5 && dobDisplay.length === 4) val += '/';
    if (val.length > 10) return; // Limit length

    setDobDisplay(val);

    // If matches DD/MM/YYYY fully
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [d, m, y] = val.split('/');
      // Basic check
      if (parseInt(d) > 31 || parseInt(m) > 12) return;

      const iso = `${y}-${m}-${d}`;
      const date = new Date(iso);
      if (!isNaN(date.getTime())) {
        setFormData(prev => ({ ...prev, birthDate: iso }));
        calculateAge(iso);
      }
    }
  };

  // Handler for Calendar Picker
  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (!iso) return;
    setFormData(prev => ({ ...prev, birthDate: iso }));
    calculateAge(iso);
    // Sync display text
    const [y, m, d] = iso.split('-');
    setDobDisplay(`${d}/${m}/${y}`);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent, sendWhatsApp: boolean = false) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Mobile Validation: Strict 10 Digits
    if (formData.mobile?.length !== 10) {
      alert("Mobile number must be exactly 10 digits.");
      return;
    }

    // 1. Check Lifetime Limit before adding NEW patient
    const allowed = await checkPatientLimit();
    if (!allowed) return;

    if (formData.firstName && formData.lastName && formData.mobile && formData.uhid) {
      setIsSubmitting(true);
      try {
        // Auto-add new District to masterData if it doesn't exist
        let updatedMasterData = { ...masterData };
        let isMasterDataUpdated = false;

        if (formData.state && formData.city) {
          const districtName = formData.city.toUpperCase();
          const currentDistricts = updatedMasterData.statesAndCities[formData.state] || [];
          if (!currentDistricts.includes(districtName)) {
            const updatedSC = { ...updatedMasterData.statesAndCities };
            updatedSC[formData.state] = [...currentDistricts, districtName].sort();
            updatedMasterData = { ...updatedMasterData, statesAndCities: updatedSC };
            isMasterDataUpdated = true;
          }
        }

        // Auto-add new Taluka to masterData if it doesn't exist
        if (formData.city && formData.taluka) {
          const districtName = formData.city.toUpperCase();
          const talukaName = formData.taluka.toUpperCase();

          // Ensure districtsAndTalukas object exists
          const dt = updatedMasterData.districtsAndTalukas || {};
          const currentTalukas = dt[districtName] || [];

          if (!currentTalukas.includes(talukaName)) {
            const updatedDT = { ...dt };
            updatedDT[districtName] = [...currentTalukas, talukaName].sort();
            updatedMasterData = { ...updatedMasterData, districtsAndTalukas: updatedDT };
            isMasterDataUpdated = true;
          }
        }

        if (isMasterDataUpdated) {
          await updateMasterData(updatedMasterData);
        }

        // Explicitly force New user type and Visit Count 1 for new registrations
        const newPatientData = {
          ...formData,
          visitCount: 1,
          userType: 'New'
        } as Patient;

        const emptyClinicalData = {
          complaint: '', history: '', findings: '', investigation: '', diagnosis: '',
          actionPlan: '', treatment: '', advice: '', instruction: '',
          vitals: { bp: '', temp: '', spo2: '', pulse: '', height: '', weight: '', bmi: '' },
          prescriptions: [],
          printSettings: {}
        };

        // Sequential save to prevent race conditions (Foreign Key constraints)
        await savePatient(newPatientData);
        await saveVisit(newPatientData.uhid, newPatientData.date, 1, emptyClinicalData);

        if (sendWhatsApp) {
          const consultant = doctorUsers.find(d => d.name === newPatientData.consultantName);
          const msg = formatRegistrationMessage({
            patientTitle: newPatientData.title,
            patientName: `${newPatientData.firstName} ${newPatientData.lastName}`,
            clinicName: masterData?.clinicName || 'Clinic',
            uhid: newPatientData.uhid,
            age: newPatientData.age,
            sex: newPatientData.sex,
            mobile: newPatientData.mobile,
            address: newPatientData.address,
            doctorName: newPatientData.consultantName || 'Doctor',
            doctorDesignation: consultant?.designation || 'Consultant',
            visitDate: formatDate(newPatientData.date),
            visitNo: "1st Visit",
            purpose: newPatientData.purposeOfVisit || 'Consultation'
          });
          sendWhatsAppMessage(newPatientData.mobile, msg);
        }

        navigate('/dashboard');
      } catch (error: any) {
        console.error("Registration failed:", error);
        alert(`Failed to register patient: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      alert("Please fill in all required fields (First Name, Last Name, Mobile No).");
    }
  };

  if (!masterData) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-muted">
        Loading form data...
      </div>
    );
  }

  // Dynamic Options
  const stateOptions = Object.keys(masterData.statesAndCities).sort().map(s => ({ value: s, label: s }));
  const referredByOptions = masterData.referredBy.map(r => ({ value: r, label: r }));
  const paymentByOptions = masterData.paymentBy.map(p => ({ value: p, label: p }));
  const purposeOptions = masterData.purposeOfVisit.map(p => ({ value: p, label: p }));

  // Consultant Options Construction
  const consultantOptions = doctorUsers.map(u => ({
    value: u.name,
    label: u.designation ? `${u.name} (${u.designation})` : u.name
  }));

  // Load ID Proofs from Master Data (with fallback)
  const idProofOptions = (masterData.idProofs && masterData.idProofs.length > 0)
    ? masterData.idProofs.map(i => ({ value: i, label: i }))
    : [{ value: 'Aadhar Card', label: 'Aadhar Card' }, { value: 'PAN', label: 'PAN' }];

  const isDoctor = currentUser?.role === UserRole.DOCTOR;



  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* SECTION: CHECK IN OLD PATIENT */}
      <Card className="border-l-4 border-l-secondary">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-secondary/10 rounded-lg text-secondary hidden md:block">
            <UserCheck size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-heading font-bold text-white mb-2">Existing Patient Check-in</h2>
            <p className="text-sm text-text-muted mb-4">Enter UHID, Name, or Phone Number to find and check-in an existing patient.</p>

            <div className="relative">
              <Input
                placeholder="Start typing to search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 py-3 text-lg"
              />
              <Search className="absolute left-3 top-3.5 text-text-muted" size={20} />
            </div>

            {/* Search Results Dropdown/List */}
            {searchResults.length > 0 && (
              <div className="mt-4 border border-border rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2">
                <table className="w-full text-left text-sm">
                  <thead className="bg-background text-text-muted uppercase text-xs">
                    <tr>
                      <th className="px-4 py-2">UHID</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Mobile</th>
                      <th className="px-4 py-2">Last Visit</th>
                      <th className="px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {searchResults.map(p => (
                      <tr key={p.uhid} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-primary">{p.uhid}</td>
                        <td className="px-4 py-3 font-medium">{p.firstName} {p.lastName}</td>
                        <td className="px-4 py-3">{p.mobile}</td>
                        <td className="px-4 py-3">{formatDate(p.date)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" onClick={() => handleCheckInOldPatient(p)}>
                            Check In (Visit #{(p.visitCount || 0) + 1})
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {searchTerm.length > 2 && searchResults.length === 0 && (
              <p className="text-text-muted text-sm mt-2 italic">No patients found. Please register as new below.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between mt-8">
        <h1 className="text-2xl font-heading font-bold text-white">New Patient Registration</h1>
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-8 border-l-4 border-l-primary">
          {/* Section 1: Basic Info */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-4 border-b border-border pb-2">
              Registration Details (1st Visit)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Input
                label="Date"
                type="date"
                name="date"
                className="bg-blue-700"
                value={formData.date}
                onChange={handleChange}
                required
              />
              <Input
                label="UHID"
                value={formData.uhid}
                readOnly
                className="bg-card font-mono text-primary border-primary/30 cursor-not-allowed"
              />
              <div className="opacity-70 pointer-events-none">
                <Select
                  label="User Type"
                  name="userType"
                  options={[{ value: 'New', label: 'New' }]}
                  value="New"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Personal Details */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-4 border-b border-border pb-2">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Select
                label="Title"
                name="title"
                options={[
                  { value: 'Mr', label: 'Mr' },
                  { value: 'Mrs', label: 'Mrs' },
                  { value: 'Ms', label: 'Ms' },
                  { value: 'Master', label: 'Master' },
                  { value: 'Shri', label: 'Shri' },
                  { value: 'Smt', label: 'Smt' },
                  { value: 'Kumari', label: 'Kumari' },
                  { value: 'Miss.', label: 'Miss.' },
                  { value: 'Dr', label: 'Dr' },
                  { value: 'Baby', label: 'Baby' }
                ]}
                value={formData.title}
                onChange={handleChange}
                className="col-span-1"
                required
              />
              <Input
                label="First Name"
                name="firstName"
                value={formData.firstName || ''}
                onChange={handleChange}
                placeholder="First Name"
                required
                className="col-span-3 md:col-span-1"
              />
              <Input
                label="Middle Name"
                name="middleName"
                value={formData.middleName || ''}
                onChange={handleChange}
                placeholder="Optional"
              />
              <Input
                label="Last Name"
                name="lastName"
                value={formData.lastName || ''}
                onChange={handleChange}
                placeholder="Surname"
                required
              />

              {/* Custom Date of Birth Field (Manual + Picker) */}
              <div className="w-full">
                <label className="block text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">Date of Birth</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={dobDisplay}
                    onChange={handleManualDobChange}
                    maxLength={10}
                    className="w-full bg-yellow-700 border border-yellow-700/50 rounded-lg px-3 py-2 text-text-primary placeholder-white/50 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-colors"
                    required
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="relative w-6 h-6 flex items-center justify-center">
                      <Calendar size={18} className="text-white pointer-events-none" />
                      <input
                        type="date"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleDatePickerChange}
                        tabIndex={-1}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Input
                label="Age"
                type="number"
                name="age"
                value={formData.age || ''}
                onChange={handleAgeChange}
                className="bg-card cursor-pointer hover:border-primary transition-colors"
              />
              <Select
                label="Sex"
                name="sex"
                options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]}
                value={formData.sex}
                onChange={handleChange}
                required
              />
              <Input
                label="Mobile No"
                type="text"
                name="mobile"
                value={formData.mobile || ''}
                onChange={handleMobileChange}
                placeholder="10 digit number"
                maxLength={10}
                required
              />
            </div>
          </div>

          {/* Section 3: Contact & Visit */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-4 border-b border-border pb-2">
              Contact & Visit Details
            </h3>
            <div className="space-y-6">
              {/* Address - Full Width */}
              <Input
                label="Address"
                name="address"
                value={formData.address || ''}
                onChange={handleChange}
                placeholder="Street / Area / Building"
                required
              />

              {/* State, District, Taluka Group */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/5 p-4 rounded-lg border border-border/50">
                <Select
                  label="State"
                  name="state"
                  options={[{ value: '', label: 'Select State' }, ...stateOptions]}
                  value={formData.state || ''}
                  onChange={handleChange}
                  required
                />
                
                <div className="w-full">
                   <label className="block text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">District</label>
                   <input
                     list="district-list"
                     name="city"
                     value={formData.city || ''}
                     onChange={handleChange}
                     disabled={!formData.state}
                     placeholder="Enter or select District"
                     className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                     required
                   />
                   <datalist id="district-list">
                      {cityOptions.map(c => <option key={c.value} value={c.value} />)}
                   </datalist>
                </div>

                <div className="w-full">
                   <label className="block text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">Taluka</label>
                   <input
                     list="taluka-list"
                     name="taluka"
                     value={formData.taluka || ''}
                     onChange={handleChange}
                     disabled={!formData.state}
                     placeholder="Enter or select Taluka"
                     className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                     required
                   />
                   <datalist id="taluka-list">
                      {talukaOptions.map(t => <option key={t} value={t} />)}
                   </datalist>
                </div>
              </div>

              {/* Referred By, Payment By, Consultant Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Select
                  label="Referred By"
                  name="referredBy"
                  options={referredByOptions}
                  value={formData.referredBy}
                  onChange={handleChange}
                  required
                />
                <Select
                  label="Payment By"
                  name="paymentBy"
                  options={paymentByOptions}
                  value={formData.paymentBy}
                  onChange={handleChange}
                  required
                />

                {/* Consultant Selection Logic */}
                {isDoctor ? (
                  <div className="opacity-80">
                    <Input
                      label="Consultant (Auto-Assigned)"
                      value={currentUser?.name}
                      readOnly
                      className="bg-primary/10 border-primary/30 text-primary font-medium"
                    />
                  </div>
                ) : (
                  <Select
                    label="Consultant"
                    name="consultantName"
                    options={[{ value: '', label: 'Select Doctor' }, ...consultantOptions]}
                    value={formData.consultantName || ''}
                    onChange={handleChange}
                    required
                  />
                )}
              </div>

              {/* ID Proof Type, ID Number, Email Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Select
                  label="ID Proof Type"
                  name="idProofType"
                  options={idProofOptions}
                  value={formData.idProofType}
                  onChange={handleChange}
                />
                <Input
                  label="ID Number"
                  name="idProofNumber"
                  value={formData.idProofNumber || ''}
                  onChange={handleChange}
                  placeholder="Optional"
                />
                {/* Added Gmail ID Input */}
                <Input
                  label="Gmail ID"
                  name="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  placeholder="optional"
                />
              </div>

              {/* Purpose of Visit - Full Width */}
              <Select
                label="Purpose of Visit"
                name="purposeOfVisit"
                options={purposeOptions}
                value={formData.purposeOfVisit}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-4">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={(e) => handleSubmit(e as any, true)}
              className="bg-green-600 hover:bg-green-700 text-white border-none"
              disabled={isSubmitting}
            >
              <MessageSquare size={18} className="mr-2" />
              {isSubmitting ? 'Processing...' : 'Save & WhatsApp'}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save New Patient'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
