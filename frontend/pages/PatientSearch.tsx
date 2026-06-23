import React, { useState, useEffect } from 'react';
import { Card, Input, Table, Button, Modal, cn, Select } from '../components/UI';
import { Patient, Bill, PrescriptionRecord, User, UserRole, MasterData, PatientDocument, DoctorPageSettings } from '../types';
import { 
  getPatients, getBills, formatDate, deletePatient, getStoredAuth, getPatientHistory, 
  getAllVisits, deleteVisit, getDoctorPageSettings, saveDoctorPageSettings, getUsers,
  getPatientDocuments, uploadPatientDocument, updatePatientDocumentName, deletePatientDocument, getPatientDocumentViewUrl
} from '../services/storage';
import { 
  Users, Search, User as UserIcon, Calendar, Phone, MapPin, Trash2, Printer, Edit, Pill, FileText, 
  Activity, Clock, DollarSign, Download, Filter, ChevronRight, Eye, MoreVertical, Edit3, X, RefreshCw,
  Upload, AlertCircle, TrendingUp, ArrowLeft, MessageSquare
} from 'lucide-react';
import { formatBillingMessage, sendWhatsAppMessage } from '../services/whatsapp';
import { PrescriptionModal } from './PrescriptionModal';
import { AnimatePresence, motion } from 'framer-motion';
import { useRef } from 'react';
import * as XLSX from 'xlsx';
import { useMasterData } from '../MasterContext';
import { useNavigate } from 'react-router-dom';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid, BarChart, Bar, Legend, LineChart, Line 
} from 'recharts';

// Visit-based row for the search table
interface VisitRow {
  visitId: number;
  uhid: string;
  visitDate: string;
  visitCount: number;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  age: number;
  sex: string;
  mobile: string;
  address: string;
  state?: string;
  city?: string;
  taluka?: string;
  userType: string;
  consultantName: string;
  referredBy?: string;
  paymentBy?: string;
  registrationDate: string;
  email?: string;
  idProofType?: string;
  idProofNumber?: string;
  purposeOfVisit?: string;
  birthDate?: string;
  totalVisits: number;
  prescriptionCount: number;
}

export const PatientSearch: React.FC = () => {
  const { masterData } = useMasterData();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visitRecords, setVisitRecords] = useState<VisitRow[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [consultantList, setConsultantList] = useState<string[]>([]);

  // Advanced Filter State
  const [filters, setFilters] = useState({
    term: '',
    date: '', // Specific Date YYYY-MM-DD
    userType: 'All',
    address: '', // Address or Taluka
    state: '',
    city: '',
    sex: 'All',
    age: '', // Single "25" or Range "20-30"
    year: '', // YYYY
    consultant: '' // Filter by Consultant Name
  });

  const [filteredVisits, setFilteredVisits] = useState<VisitRow[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Analytics Modal State
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'prescriptions' | 'bills' | 'clinical_notes' | 'analytics'>('details');
  const [patientBills, setPatientBills] = useState<Bill[]>([]);

  // Document management states
  const [patientDocuments, setPatientDocuments] = useState<PatientDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editingDocName, setEditingDocName] = useState('');

  // Page Settings for Print
  const [pageSettings, setPageSettings] = useState<any>(null);
  const [printZoom, setPrintZoom] = useState(1.0);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Preview States
  const [viewPrescription, setViewPrescription] = useState<PrescriptionRecord | null>(null);
  const [isRxViewOnly, setIsRxViewOnly] = useState(true);
  const [isPrescriptionModalOpen, setPrescriptionModalOpen] = useState(false);

  // Bill Print State
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [isBillPreviewOpen, setBillPreviewOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [p, b, v] = await Promise.all([
          getPatients(),
          getBills(),
          getAllVisits()
        ]);
        setCurrentUser(getStoredAuth());

        setPatients(p);
        setBills(b);
        setVisitRecords(v);
      } catch (e) {
        console.error(e);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (masterData) {
      setConsultantList(masterData.consultants || []);
    }
  }, [masterData]);

  useEffect(() => {
    if (viewingBill && selectedPatient) {
      const loadSettings = async () => {
        const allUsers = await getUsers();
        const consultant = allUsers.find(u => u.name === viewingBill.consultant);
        if (consultant) {
          const settings = await getDoctorPageSettings(consultant.id);
          setPageSettings(settings);
        } else {
          setPageSettings(null);
        }
      };
      loadSettings();
    }
  }, [viewingBill, selectedPatient]);

  // Billing Auto-scaling logic
  useEffect(() => {
    if (viewingBill && printAreaRef.current) {
      const timer = setTimeout(() => {
        const contentHeight = printAreaRef.current?.scrollHeight || 0;
        const paperSize = pageSettings?.paper_size || 'A4';
        const pageHeightPx = paperSize === 'A4' ? 1122 : 900; 
        const marginTopPx = (pageSettings?.margin_top_cm || 2) * 37.8;
        const marginBottomPx = (pageSettings?.margin_bottom_cm || 2) * 37.8;
        const usableHeight = pageHeightPx - marginTopPx - marginBottomPx;

        if (contentHeight > usableHeight && usableHeight > 0) {
          const zoom = Math.max(0.6, usableHeight / contentHeight);
          setPrintZoom(zoom);
        } else {
          setPrintZoom(1.0);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [viewingBill, pageSettings]);



  // --- Real-time Filtering Logic (Visit-based) ---
  useEffect(() => {
    let results = visitRecords;

    // 0. Security Filter: Limit Doctors to their own patients
    if (currentUser && currentUser.role === UserRole.DOCTOR) {
      const cleanUserName = currentUser.name.toLowerCase().replace(/^dr\.?\s+/, '');
      results = results.filter(v => {
        const cleanConsultantName = v.consultantName.toLowerCase().replace(/^dr\.?\s+/, '');
        return cleanConsultantName === cleanUserName;
      });
    }

    // 0.5. Consultant Filter (Admin/Receptionist Only)
    if (filters.consultant) {
      results = results.filter(v => v.consultantName === filters.consultant);
    }

    // 1. Search Term (Name, UHID, Mobile)
    if (filters.term) {
      const lowerTerm = filters.term.toLowerCase();
      results = results.filter(v =>
        v.firstName.toLowerCase().includes(lowerTerm) ||
        v.lastName.toLowerCase().includes(lowerTerm) ||
        v.uhid.toLowerCase().includes(lowerTerm) ||
        v.mobile.includes(lowerTerm)
      );
    }

    // 2. Specific Date (visit date)
    if (filters.date) {
      results = results.filter(v => v.visitDate === filters.date);
    }

    // 3. User Type (New / Old)
    if (filters.userType !== 'All') {
      results = results.filter(v => v.userType === filters.userType);
    }

    // 4. Address / Taluka
    if (filters.address) {
      const lowerAddr = filters.address.toLowerCase();
      results = results.filter(v =>
        (v.address && v.address.toLowerCase().includes(lowerAddr)) ||
        (v.taluka && v.taluka.includes(lowerAddr))
      );
    }

    // 5. State
    if (filters.state) {
      results = results.filter(v => v.state === filters.state);
    }

    // 6. City
    if (filters.city) {
      results = results.filter(v => v.city === filters.city);
    }

    // 7. Gender
    if (filters.sex !== 'All') {
      results = results.filter(v => v.sex === filters.sex);
    }

    // 8. Age (Single or Range)
    if (filters.age) {
      if (filters.age.includes('-')) {
        const [min, max] = filters.age.split('-').map(str => parseInt(str.trim()));
        if (!isNaN(min) && !isNaN(max)) {
          results = results.filter(v => v.age >= min && v.age <= max);
        }
      } else {
        const ageVal = parseInt(filters.age);
        if (!isNaN(ageVal)) {
          results = results.filter(v => v.age === ageVal);
        }
      }
    }

    // 9. Year (YYYY)
    if (filters.year) {
      results = results.filter(v => v.visitDate.startsWith(filters.year));
    }

    setFilteredVisits(results);
  }, [filters, visitRecords, currentUser]);

  // Derived Options
  const stateOptions = masterData && masterData.statesAndCities ? Object.keys(masterData.statesAndCities).sort().map(s => ({ value: s, label: s })) : [];
  const cityOptions = masterData && masterData.statesAndCities && filters.state && masterData.statesAndCities[filters.state]
    ? masterData.statesAndCities[filters.state].map(c => ({ value: c, label: c }))
    : [];

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      // Reset city if state changes
      if (key === 'state') newFilters.city = '';
      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters({
      term: '',
      date: '',
      userType: 'All',
      address: '',
      state: '',
      city: '',
      sex: 'All',
      age: '',
      year: '',
      consultant: ''
    });
  };

  const handleExportExcel = () => {
    if (filteredVisits.length === 0) {
      alert("No records to export.");
      return;
    }

    const dataToExport = filteredVisits.map((v, idx) => ({
      'Sr No': idx + 1,
      'UHID': v.uhid,
      'Visit No': v.visitCount,
      'Visit Date': formatDate(v.visitDate),
      'First Name': v.firstName,
      'Last Name': v.lastName,
      'Age': v.age,
      'Gender': v.sex,
      'Mobile': v.mobile,
      'User Type': v.userType,
      'Consultant': v.consultantName,
      'Address': v.address || '',
      'City': v.city || '',
      'State': v.state || '',
      'Taluka': v.taluka || '',
      'Payment Mode': v.paymentBy || '',
      'Total Visits': v.totalVisits || 1
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visits");

    const fileName = `Visit_Records_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handlePatientClick = async (patient: Patient) => {
    // Fetch History On-Demand
    const history = await getPatientHistory(patient.uhid);
    setSelectedPatient({ ...patient, prescriptionHistory: history });

    // Sort Bills Ascending by Visit Count
    const pBills = bills
      .filter(b => b.uhid === patient.uhid)
      .sort((a, b) => (a.visitCount || 0) - (b.visitCount || 0) || a.date.localeCompare(b.date));
    setPatientBills(pBills);
    
    // Fetch Documents
    loadPatientDocs(patient.uhid);
    
    setActiveTab('details');
  };

  const loadPatientDocs = async (uhid: string) => {
    setLoadingDocuments(true);
    setDocumentError('');
    try {
      const docs = await getPatientDocuments(uhid);
      setPatientDocuments(docs);
    } catch (e: any) {
      console.error(e);
      setDocumentError('Failed to load patient documents');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPatient) return;

    setUploadingDoc(true);
    setDocumentError('');
    try {
      await uploadPatientDocument(selectedPatient.uhid, file);
      await loadPatientDocs(selectedPatient.uhid);
    } catch (err: any) {
      console.error(err);
      setDocumentError(err.message || 'Upload failed');
    } finally {
      setUploadingDoc(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDocRename = async (id: number) => {
    if (!editingDocName.trim() || !selectedPatient) return;
    try {
      await updatePatientDocumentName(id, editingDocName.trim());
      setEditingDocId(null);
      setEditingDocName('');
      await loadPatientDocs(selectedPatient.uhid);
    } catch (err: any) {
      console.error(err);
      setDocumentError(err.message || 'Rename failed');
    }
  };

  const handleDocDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.') || !selectedPatient) return;
    try {
      await deletePatientDocument(id);
      await loadPatientDocs(selectedPatient.uhid);
    } catch (err: any) {
      console.error(err);
      setDocumentError(err.message || 'Delete failed');
    }
  };

  const handleDeleteVisitRecord = async (e: React.MouseEvent, visit: VisitRow) => {
    e.stopPropagation();
    const confirmDelete = window.confirm(
      `Are you sure you want to delete Visit #${visit.visitCount} for ${visit.firstName} ${visit.lastName} (${visit.uhid})?\n\nThis will remove only this visit's clinical data, prescriptions, and associated bill.`
    );

    if (confirmDelete) {
      try {
        await deleteVisit(visit.uhid, visit.visitCount);
        // Remove from local state
        setVisitRecords(prev => prev.filter(v => !(v.uhid === visit.uhid && v.visitCount === visit.visitCount)));
        setBills(prev => prev.filter(b => !(b.uhid === visit.uhid && b.visitCount === visit.visitCount)));
      } catch (err: any) {
        alert('Delete failed: ' + err.message);
      }
    }
  };

  const handlePrintRx = (record: PrescriptionRecord) => {
    setViewPrescription(record);
    setIsRxViewOnly(true);
    setPrescriptionModalOpen(true);
  };

  const handleEditRx = (record: PrescriptionRecord) => {
    setViewPrescription(record);
    setIsRxViewOnly(false);
    setPrescriptionModalOpen(true);
  };

  const handlePrintBill = (bill: Bill) => {
    setViewingBill(bill);
    setBillPreviewOpen(true);
  };

  const handlePrint = async () => {
    setTimeout(() => {
      window.print();
    }, 100);

    if (pageSettings) {
      try {
        await saveDoctorPageSettings(pageSettings);
      } catch (err) {
        console.error("Failed to save settings on print", err);
      }
    }
  };

  // Auto-save page settings to database when changed (debounced)
  useEffect(() => {
    if (!pageSettings || !pageSettings.doctor_id) return;
    const timer = setTimeout(() => {
      saveDoctorPageSettings(pageSettings).catch(err => console.error("Auto-save settings failed:", err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [pageSettings]);

  const updatePageSetting = (key: keyof DoctorPageSettings, val: any) => {
    setPageSettings((prev: any) => {
      const base = prev || {
        doctor_id: '',
        paper_size: 'A4',
        header_enabled: 1,
        margin_top_cm: 2.0,
        margin_left_cm: 2.0,
        margin_right_cm: 2.0,
        margin_bottom_cm: 2.0
      };
      return { ...base, [key]: val };
    });
  };

  const handleWhatsAppBilling = () => {
    if (!viewingBill || !selectedPatient) return;

    const subTotal = viewingBill.total;
    const itemsStr = viewingBill.items.map((it, idx) =>
      `${idx + 1}. ${it.particulars}  ₹${it.amount.toFixed(2)}`
    ).join('\n');

    const msg = formatBillingMessage({
      patientTitle: selectedPatient.title,
      patientName: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
      clinicName: masterData?.clinicName || 'Clinic',
      uhid: selectedPatient.uhid,
      age: selectedPatient.age,
      sex: selectedPatient.sex,
      mobile: selectedPatient.mobile,
      address: selectedPatient.address,
      consultantName: viewingBill.consultant,
      visitNo: ordinals(viewingBill.visitCount || 1) + " Visit",
      paymentBy: selectedPatient.paymentBy || 'Self',
      paymentMode: viewingBill.paymentMode,
      billItems: itemsStr,
      subTotal: subTotal.toFixed(2),
      netTotal: calculateNet(viewingBill).toFixed(2),
      invoiceNo: viewingBill.billNo,
      date: formatDate(viewingBill.date)
    });

    sendWhatsAppMessage(selectedPatient.mobile, msg);
  };

  const handleEditBill = (bill: Bill) => {
    // Navigate to Billing page with edit state
    navigate('/billing', { state: { editBill: bill } });
  };

  // Helper to safely check boolean/string flags
  const isEnabled = (val: any) => val === true || val === 'true';

  // --- Analytics Calculation Helpers ---
  const calculateDiscount = (bill: Bill) => {
    if (bill.discountType === 'Percentage') {
      return (bill.total * (bill.discountValue || 0)) / 100;
    }
    return bill.discountValue || 0;
  };

  const calculateTax = (bill: Bill) => {
    const taxable = Math.max(0, bill.total - calculateDiscount(bill));
    const gstPercent = masterData.gstRate || 18;
    return isEnabled(masterData.enableGst) ? (taxable * (gstPercent / 100)) : 0;
  };

  const calculateNet = (bill: Bill) => {
    const subTotal = bill.total;
    const discountAmount = calculateDiscount(bill);
    const taxable = Math.max(0, subTotal - discountAmount);
    const tax = calculateTax(bill);
    return taxable + tax;
  };

  const getTotalSpent = () => patientBills.reduce((acc, curr) => acc + calculateNet(curr), 0);
  const getAverageBill = () => patientBills.length ? (getTotalSpent() / patientBills.length).toFixed(0) : 0;

  const getVisitHistory = () => {
    return patientBills.slice(0, 10).map(b => ({ date: b.date, amount: calculateNet(b) }));
  };

  const getHighestBill = () => patientBills.length ? Math.max(...patientBills.map(b => calculateNet(b))) : 0;

  const getVitalsHistory = () => {
    if (!selectedPatient || !selectedPatient.prescriptionHistory) return [];
    return [...selectedPatient.prescriptionHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(h => {
        let systolic = null;
        let diastolic = null;
        const bpStr = h.data.vitals?.bp || '';
        if (bpStr && bpStr.includes('/')) {
          const parts = bpStr.split('/');
          const s = parseInt(parts[0]);
          const d = parseInt(parts[1]);
          if (!isNaN(s)) systolic = s;
          if (!isNaN(d)) diastolic = d;
        }

        const parseVal = (val: any) => {
          if (val === undefined || val === null) return null;
          const p = parseFloat(String(val));
          return isNaN(p) ? null : p;
        };

        return {
          date: formatDate(h.date),
          rawDate: h.date,
          visitCount: h.visitCount,
          bp: bpStr,
          systolic,
          diastolic,
          pulse: parseVal(h.data.vitals?.pulse),
          spo2: parseVal(h.data.vitals?.spo2),
          temp: parseVal(h.data.vitals?.temp),
          weight: parseVal(h.data.vitals?.weight),
          bmi: parseVal(h.data.vitals?.bmi)
        };
      });
  };

  const getMostPrescribedMedicines = () => {
    if (!selectedPatient || !selectedPatient.prescriptionHistory) return [];
    const counts: Record<string, number> = {};
    selectedPatient.prescriptionHistory.forEach(h => {
      if (h.data.prescriptions) {
        h.data.prescriptions.forEach(p => {
          if (p.medicineName) {
            const name = p.medicineName.trim().toUpperCase();
            if (name) {
              counts[name] = (counts[name] || 0) + 1;
            }
          }
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const getPaymentModeBreakdown = () => {
    const breakdown: Record<string, number> = {};
    patientBills.forEach(b => {
      const mode = b.paymentMode || 'CASH';
      breakdown[mode] = (breakdown[mode] || 0) + calculateNet(b);
    });
    return Object.entries(breakdown).map(([name, value]) => ({ name, value }));
  };

  const DetailItem = ({ label, value, className, isMono }: { label: string, value: string | number | undefined, className?: string, isMono?: boolean }) => (
    <div className={className}>
      <label className="text-xs text-text-muted uppercase block mb-1 font-semibold tracking-wider">{label}</label>
      <p className={cn("text-base text-text-primary", isMono && "font-mono text-primary font-medium")}>{value || '-'}</p>
    </div>
  );

  if (!masterData) return <div className="p-8 text-white">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">Patient Search</h1>
          {currentUser?.role === UserRole.DOCTOR && (
            <p className="text-xs text-text-muted mt-1">Showing patients assigned to <span className="text-primary">{currentUser.name}</span></p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={showFilters ? 'primary' : 'secondary'}
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter size={16} /> Filters
            {(Object.values(filters).some(v => v !== '' && v !== 'All')) && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} title="Export Results to Excel" disabled={filteredVisits.length === 0} className="flex items-center gap-2">
            <Download size={16} /> <span className="hidden sm:inline">Export</span>
          </Button>
          <Button variant="ghost" onClick={clearFilters} title="Reset Filters">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* FILTER DASHBOARD */}
      {showFilters && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
        >
          <div className="overflow-hidden">
            <Card className="bg-card/50 border border-primary/20">
              <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* 1. Main Search */}
                <div className="col-span-1 md:col-span-2 relative">
                  <Input
                    placeholder="Search Name, UHID or Mobile..."
                    value={filters.term}
                    onChange={(e) => handleFilterChange('term', e.target.value)}
                    className="pl-10 border-primary/50"
                  />
                  <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                </div>

              {/* CONSULTANT FILTER (Only for Admin/Receptionist) */}
              {currentUser?.role !== UserRole.DOCTOR && (
                <Select
                  label="Filter by Consultant"
                  options={[{ value: '', label: 'All Consultants' }, ...consultantList.map(c => ({ value: c, label: c }))]}
                  value={filters.consultant}
                  onChange={(e) => handleFilterChange('consultant', e.target.value)}
                />
              )}

              {/* 2. User Type */}
              <Select
                label="User Type"
                options={[
                  { value: 'All', label: 'All Patients' },
                  { value: 'New', label: 'New Only' },
                  { value: 'Old', label: 'Old Only' }
                ]}
                value={filters.userType}
                onChange={(e) => handleFilterChange('userType', e.target.value)}
              />

              {/* 3. Date (Specific) */}
              <div className="relative">
                <Input
                  type="date"
                  value={filters.date}
                  onChange={(e) => handleFilterChange('date', e.target.value)}
                  label="Visit Date"
                  className="pr-8"
                />
                {filters.date && (
                  <button
                    onClick={() => handleFilterChange('date', '')}
                    className="absolute right-2 top-8 text-white/50 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 4. Year */}
              <Input
                type="number"
                placeholder="e.g. 2025"
                value={filters.year}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                label="Filter by Year"
              />

              {/* 5. Address / Taluka */}
              <Input
                placeholder="Place or Taluka"
                value={filters.address}
                onChange={(e) => handleFilterChange('address', e.target.value)}
                label="Address Filter"
              />

              {/* 6. State */}
              <Select
                label="State"
                options={[{ value: '', label: 'All States' }, ...stateOptions]}
                value={filters.state}
                onChange={(e) => handleFilterChange('state', e.target.value)}
              />

              {/* 7. City */}
              <Select
                label="City"
                options={[{ value: '', label: 'All Cities' }, ...cityOptions]}
                value={filters.city}
                onChange={(e) => handleFilterChange('city', e.target.value)}
                disabled={!filters.state}
              />

              {/* 8. Sex */}
              <Select
                label="Gender"
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'Male', label: 'Male' },
                  { value: 'Female', label: 'Female' },
                  { value: 'Other', label: 'Other' }
                ]}
                value={filters.sex}
                onChange={(e) => handleFilterChange('sex', e.target.value)}
              />

              {/* 9. Age */}
              <Input
                placeholder="e.g. 25 or 20-30"
                value={filters.age}
                onChange={(e) => handleFilterChange('age', e.target.value)}
                label="Age (Val or Range)"
              />
            </div>
          </Card>
        </div>
      </motion.div>
      )}

      {/* RESULTS TABLE */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table headers={['Sr No', 'UHID', 'Patient Name', 'Visit No', 'Age/Sex', 'Mobile', 'Location', 'Visit Date', 'Consultant', 'Action']}>
            {filteredVisits.length > 0 ? (
              filteredVisits.map((v, index) => {
                // Build a Patient-like object for double-click handler
                const patientLike: Patient = {
                  uhid: v.uhid, date: v.visitDate, userType: v.userType as any,
                  title: v.title, firstName: v.firstName, middleName: v.middleName,
                  lastName: v.lastName, birthDate: v.birthDate || '', age: v.age,
                  sex: v.sex as any, address: v.address, state: v.state, city: v.city,
                  taluka: v.taluka, mobile: v.mobile, email: v.email,
                  referredBy: v.referredBy || '', paymentBy: v.paymentBy || '',
                  consultantName: v.consultantName, idProofType: v.idProofType || '',
                  idProofNumber: v.idProofNumber || '', purposeOfVisit: v.purposeOfVisit || '',
                  visitCount: v.totalVisits
                };
                return (
                  <tr
                    key={`${v.uhid}-${v.visitCount}`}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onDoubleClick={() => handlePatientClick(patientLike)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{index + 1}</td>
                    <td className="px-4 py-3 font-mono text-primary text-xs">{v.uhid}</td>
                    <td className="px-4 py-3 font-medium">
                      {v.title} {v.firstName} {v.lastName}
                      <span className={cn(
                        "ml-2 text-[10px] px-1.5 py-0.5 rounded",
                        v.userType === 'New' ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                      )}>{v.userType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-primary/10 text-primary font-bold px-2 py-1 rounded text-xs">
                        {v.visitCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">{v.age} / {v.sex}</td>
                    <td className="px-4 py-3">{v.mobile}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {v.city ? `${v.city}, ${v.state}` : '-'}
                    </td>
                    <td className="px-4 py-3">{formatDate(v.visitDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{v.consultantName}</span>
                        {v.prescriptionCount > 0 ? (
                          <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                            <Activity size={10} /> Checked
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted opacity-50 flex items-center gap-1">
                            <Clock size={10} /> Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => handleDeleteVisitRecord(e, v)}
                        className="text-danger hover:text-red-400 p-2 rounded-full hover:bg-danger/10 transition-colors"
                        title={`Delete Visit #${v.visitCount}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">
                  {visitRecords.length === 0 ? "No visit records found yet." : "No records found matching your search."}
                </td>
              </tr>
            )}
          </Table>
        </div>
        <div className="p-2 text-xs text-text-muted text-center border-t border-border flex justify-between items-center px-4">
          <span>Showing {filteredVisits.length} visit records</span>
          <span>Double click a row to view detailed analytics & history.</span>
        </div>
      </Card>

      {/* ADVANCED ANALYTICS MODAL */}
      {selectedPatient && (
        <Modal
          isOpen={!!selectedPatient}
          onClose={() => setSelectedPatient(null)}
          title="Patient 360° View"
          size="full"
        >
          <div className="flex flex-col h-[70vh]">
            {/* Header Profile */}
            <div className="flex items-center gap-4 mb-6 p-4 bg-card border border-border rounded-xl">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-2xl font-bold">
                {selectedPatient.firstName.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedPatient.title} {selectedPatient.firstName} {selectedPatient.lastName}</h2>
                <div className="flex gap-4 text-sm text-text-muted mt-1">
                  <span>UHID: <span className="text-primary font-mono">{selectedPatient.uhid}</span></span>
                  <span>•</span>
                  <span>{selectedPatient.age} Yrs / {selectedPatient.sex}</span>
                  <span>•</span>
                  <span>{selectedPatient.mobile}</span>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xs text-text-muted uppercase">Total Visits</div>
                <div className="text-2xl font-bold text-white">{selectedPatient.visitCount || 1}</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border mb-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab('details')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'details' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <UserIcon size={16} /> Basic Details
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'documents' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <FileText size={16} /> Patient Document
              </button>
              <button
                onClick={() => setActiveTab('prescriptions')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'prescriptions' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <Pill size={16} /> Rx History
              </button>
              <button
                onClick={() => setActiveTab('bills')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'bills' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <DollarSign size={16} /> Billing History
              </button>
              <button
                onClick={() => setActiveTab('clinical_notes')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'clinical_notes' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <FileText size={16} /> Clinical Notes
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'analytics' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                )}
              >
                <Activity size={16} /> Patient Analytics
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto pr-2">
              {/* DETAILS TAB */}
              {activeTab === 'details' && (
                <div className="space-y-6 animate-in fade-in">
                  {/* Registration Details */}
                  <div>
                    <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                      Registration Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <DetailItem label="Date" value={formatDate(selectedPatient.date)} />
                      <DetailItem label="UHID" value={selectedPatient.uhid} isMono />
                      <DetailItem label="User Type" value={selectedPatient.userType} />
                    </div>
                  </div>

                  {/* Personal Information */}
                  <div>
                    <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <DetailItem label="Title" value={selectedPatient.title} />
                      <DetailItem label="First Name" value={selectedPatient.firstName} />
                      <DetailItem label="Middle Name" value={selectedPatient.middleName} />
                      <DetailItem label="Last Name" value={selectedPatient.lastName} />

                      <DetailItem label="Date of Birth" value={formatDate(selectedPatient.birthDate)} />
                      <DetailItem label="Age" value={selectedPatient.age} />
                      <DetailItem label="Sex" value={selectedPatient.sex} />
                      <DetailItem label="Mobile No" value={selectedPatient.mobile} />
                    </div>
                  </div>

                  {/* Contact & Visit Details */}
                  <div>
                    <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                      Contact & Visit Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="col-span-3">
                        <DetailItem label="Address" value={selectedPatient.address} />
                      </div>
                      <DetailItem label="State" value={selectedPatient.state} />
                      <DetailItem label="City" value={selectedPatient.city} />
                      <DetailItem label="Taluka" value={selectedPatient.taluka} />

                      <DetailItem label="Referred By" value={selectedPatient.referredBy} />
                      <DetailItem label="Payment By" value={selectedPatient.paymentBy} />
                      <DetailItem label="Consultant" value={selectedPatient.consultantName} />

                      <DetailItem label="ID Proof Type" value={selectedPatient.idProofType} />
                      <DetailItem label="ID Number" value={selectedPatient.idProofNumber} />
                      <DetailItem label="Purpose of Visit" value={selectedPatient.purposeOfVisit} />
                    </div>
                  </div>
                </div>
              )}

              {/* PATIENT DOCUMENT TAB */}
              {activeTab === 'documents' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-border">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload Medical Record</h3>
                      <p className="text-xs text-text-muted mt-1">Upload reports, prescriptions, scans, or other files (PDF, JPG, PNG, etc.)</p>
                    </div>
                    <div>
                      <input
                        type="file"
                        id="patient-doc-upload"
                        className="hidden"
                        onChange={handleDocUpload}
                        disabled={uploadingDoc}
                      />
                      <label htmlFor="patient-doc-upload">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={uploadingDoc}
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => document.getElementById('patient-doc-upload')?.click()}
                        >
                          <Upload size={16} />
                          {uploadingDoc ? 'Uploading...' : 'Upload Document'}
                        </Button>
                      </label>
                    </div>
                  </div>

                  {documentError && (
                    <div className="bg-danger/10 text-danger p-3 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{documentError}</span>
                    </div>
                  )}

                  {loadingDocuments ? (
                    <div className="py-10 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs text-text-muted mt-2">Loading documents...</p>
                    </div>
                  ) : patientDocuments.length === 0 ? (
                    <div className="text-center py-10 text-text-muted border border-dashed border-border rounded-xl">
                      No documents uploaded for this patient yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {patientDocuments.map(doc => {
                        const isEditing = editingDocId === doc.id;
                        const fileSizeMB = (doc.file_size / (1024 * 1024)).toFixed(2);
                        return (
                          <div key={doc.id} className="bg-white/5 border border-border rounded-xl p-4 flex flex-col justify-between hover:border-primary/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                                <FileText size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="flex gap-2 items-center mt-1">
                                    <Input
                                      value={editingDocName}
                                      onChange={(e) => setEditingDocName(e.target.value)}
                                      className="py-1.5 text-sm"
                                      autoFocus
                                    />
                                    <Button size="sm" onClick={() => handleDocRename(doc.id)}>Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingDocId(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="font-semibold text-white truncate text-sm" title={doc.custom_name}>
                                      {doc.custom_name}
                                    </h4>
                                    <p className="text-[10px] text-text-muted mt-0.5 truncate">
                                      Original: {doc.default_name}
                                    </p>
                                  </>
                                )}
                                <div className="flex gap-3 text-[10px] text-text-muted mt-2">
                                  <span>Size: {fileSizeMB} MB</span>
                                  <span>•</span>
                                  <span>Uploaded: {formatDate(doc.created_at.split('T')[0])}</span>
                                </div>
                              </div>
                            </div>
                            
                            {!isEditing && (
                              <div className="flex gap-2 mt-4 pt-3 border-t border-white/5 justify-end">
                                <a
                                  href={getPatientDocumentViewUrl(doc.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-blue-400 font-medium px-2 py-1 rounded hover:bg-secondary/10 transition-colors"
                                >
                                  <Eye size={14} /> View
                                </a>
                                <button
                                  onClick={() => {
                                    setEditingDocId(doc.id);
                                    setEditingDocName(doc.custom_name);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-white font-medium px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                >
                                  <Edit size={14} /> Rename
                                </button>
                                <button
                                  onClick={() => handleDocDelete(doc.id)}
                                  className="inline-flex items-center gap-1.5 text-xs text-danger hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-danger/10 transition-colors ml-auto"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PRESCRIPTIONS TAB */}
              {activeTab === 'prescriptions' && (
                <div className="space-y-4">
                  {(!selectedPatient.prescriptionHistory || selectedPatient.prescriptionHistory.length === 0) ? (
                    <div className="text-center py-10 text-text-muted">No prescription history found.</div>
                  ) : (
                    [...selectedPatient.prescriptionHistory]
                      .sort((a, b) => (a.visitCount || 0) - (b.visitCount || 0))
                      .map((rx, idx) => (
                        <div key={rx.id} className="bg-white/5 border border-border rounded-lg p-4 flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-white">Visit #{rx.visitCount}</span>
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">{formatDate(rx.date)}</span>
                            </div>
                            <div className="text-xs text-text-muted">
                              {rx.data.prescriptions.length} Medicines Prescribed
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handlePrintRx(rx)}>
                              <Printer size={16} className="mr-2" /> Print
                            </Button>
                            <Button size="sm" onClick={() => handleEditRx(rx)}>
                              <Edit3 size={16} className="mr-2" /> Edit
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}

              {/* CLINICAL NOTES TAB */}
              {activeTab === 'clinical_notes' && (
                <div className="space-y-6">
                  {(!selectedPatient.prescriptionHistory || selectedPatient.prescriptionHistory.length === 0) ? (
                    <div className="text-center py-10 text-text-muted">No clinical notes recorded yet.</div>
                  ) : (
                    [...selectedPatient.prescriptionHistory]
                      .sort((a, b) => (a.visitCount || 0) - (b.visitCount || 0))
                      .map((rx) => (
                        <div key={rx.id} className="bg-white/5 border border-border rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50"></div>
                           <div className="flex justify-between items-start mb-4">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-white text-lg">Visit #{rx.visitCount}</span>
                                <span className="text-xs text-text-muted flex items-center gap-1"><Clock size={12}/> {formatDate(rx.date)}</span>
                              </div>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                              {rx.data.complaint && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-primary tracking-widest">Complaints</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.complaint}</p>
                                </div>
                              )}
                              {rx.data.history && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Medical History</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.history}</p>
                                </div>
                              )}
                              {rx.data.findings && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Clinical Findings</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.findings}</p>
                                </div>
                              )}
                              {rx.data.investigation && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-yellow-500 tracking-widest">Investigation</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.investigation}</p>
                                </div>
                              )}
                              {rx.data.diagnosis && (
                                <div className="space-y-1 font-medium italic">
                                  <label className="text-[10px] uppercase font-bold text-blue-400 tracking-widest">Diagnosis</label>
                                  <p className="text-sm text-blue-100 leading-relaxed whitespace-pre-wrap">{rx.data.diagnosis}</p>
                                </div>
                              )}
                              {rx.data.actionPlan && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-purple-400 tracking-widest">Action Plan</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.actionPlan}</p>
                                </div>
                              )}
                              {rx.data.advice && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-yellow-400 tracking-widest">Advice</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.advice}</p>
                                </div>
                              )}
                              {rx.data.instruction && (
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-orange-400 tracking-widest">Instructions</label>
                                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{rx.data.instruction}</p>
                                </div>
                              )}
                           </div>
                           
                           {/* Vitals Summary */}
                           {rx.data.vitals && (
                             <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 pt-4 border-t border-white/5">
                                {rx.data.vitals.bp && <div className="text-xs text-text-muted font-medium">BP: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.bp} mmHg</span></div>}
                                {rx.data.vitals.pulse && <div className="text-xs text-text-muted font-medium">Pulse: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.pulse} bpm</span></div>}
                                {rx.data.vitals.spo2 && <div className="text-xs text-text-muted font-medium">SpO2: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.spo2} %</span></div>}
                                {rx.data.vitals.temp && <div className="text-xs text-text-muted font-medium">Temp: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.temp} °F</span></div>}
                                {rx.data.vitals.height && <div className="text-xs text-text-muted font-medium">Height: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.height} cm</span></div>}
                                {rx.data.vitals.weight && <div className="text-xs text-text-muted font-medium">Weight: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.weight} kg</span></div>}
                                {rx.data.vitals.bmi && <div className="text-xs text-text-muted font-medium">BMI: <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{rx.data.vitals.bmi}</span></div>}
                                
                                {rx.data.nextVisitDate && (
                                  <div className="text-xs text-green-400 font-bold ml-auto border border-green-500/30 px-3 py-1 rounded-full bg-green-500/5">
                                    Next Follow-up: {formatDate(rx.data.nextVisitDate)}
                                  </div>
                                )}
                             </div>
                           )}
                        </div>
                      ))
                  )}
                </div>
              )}

              {/* BILLS TAB */}
              {activeTab === 'bills' && (
                <div className="space-y-4">
                  {patientBills.length === 0 ? (
                    <div className="text-center py-10 text-text-muted">No billing history found.</div>
                  ) : (
                    patientBills.map(bill => (
                      <div key={bill.billNo} className="bg-white/5 border border-border rounded-lg p-4 flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-white">Invoice #{bill.billNo}</span>
                            <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded">{formatDate(bill.date)}</span>
                            {/* Added Visit Count Badge */}
                            <span className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded text-text-muted">
                              {bill.visitCount ? `Visit ${bill.visitCount}` : `Visit 1`}
                            </span>
                          </div>
                          <div className="text-xs text-text-muted">
                            {bill.items.length} Items • Consultant: {bill.consultant}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-bold text-white">₹{calculateNet(bill).toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handlePrintBill(bill)}>
                            <Printer size={16} className="mr-2" /> Print
                          </Button>
                          <Button size="sm" onClick={() => handleEditBill(bill)}>
                            <Edit size={16} className="mr-2" /> Edit
                          </Button>
                        </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
                    {/* ANALYTICS TAB */}
              {activeTab === 'analytics' && (
                <div className="space-y-6 animate-in fade-in">
                  {/* Financial & General Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl shadow-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><DollarSign size={18} /></div>
                        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Total Spent</span>
                      </div>
                      <p className="text-2xl font-bold text-white">₹{getTotalSpent().toFixed(0)}</p>
                    </div>
                    <div className="bg-purple-500/5 border border-purple-500/20 p-4 rounded-xl shadow-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Activity size={18} /></div>
                        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Avg. Bill</span>
                      </div>
                      <p className="text-2xl font-bold text-white">₹{getAverageBill()}</p>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl shadow-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><TrendingUp size={18} /></div>
                        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Highest Bill</span>
                      </div>
                      <p className="text-2xl font-bold text-white">₹{getHighestBill().toFixed(0)}</p>
                    </div>
                    <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl shadow-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400"><Users size={18} /></div>
                        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Total Visits</span>
                      </div>
                      <p className="text-2xl font-bold text-white">{selectedPatient.visitCount || 1}</p>
                    </div>
                  </div>

                  {/* Financial Trends Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Spending Trend (Recharts AreaChart) */}
                    <div className="bg-card border border-border p-5 rounded-xl lg:col-span-2 shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider flex items-center gap-2">
                        <TrendingUp size={16} className="text-blue-400" /> Spending History
                      </h3>
                      <div className="h-64">
                        {patientBills.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={patientBills.map(b => ({ date: formatDate(b.date), amount: calculateNet(b) }))}>
                              <defs>
                                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                              <XAxis dataKey="date" stroke="#ffffff40" fontSize={11} />
                              <YAxis stroke="#ffffff40" fontSize={11} tickFormatter={(v) => `₹${v}`} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff15', borderRadius: '8px' }}
                                labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}
                                itemStyle={{ color: '#fff', fontSize: '12px' }}
                                formatter={(value: any) => [`₹${value}`, 'Amount']}
                              />
                              <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-text-muted text-sm italic">Not enough billing data</div>
                        )}
                      </div>
                    </div>

                    {/* Payment Mode & Billing Summary */}
                    <div className="bg-card border border-border p-5 rounded-xl lg:col-span-1 shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider">
                        Payment Breakdown
                      </h3>
                      <div className="h-64 flex flex-col justify-center">
                        {patientBills.length > 0 ? (
                          <div className="space-y-4">
                            {getPaymentModeBreakdown().map(({ name, value }: any) => {
                              const total = getTotalSpent() || 1;
                              const pct = ((value / total) * 100).toFixed(0);
                              return (
                                <div key={name} className="space-y-1">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-text-primary uppercase tracking-wider">{name}</span>
                                    <span className="text-text-muted">₹{value.toFixed(0)} ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-primary h-full rounded-full transition-all duration-500" 
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center text-text-muted text-sm italic">No payment record found</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Clinical Vitals Trends */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Weight & BMI Trend */}
                    <div className="bg-card border border-border p-5 rounded-xl shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-emerald-400" /> Weight & BMI Trend
                      </h3>
                      <div className="h-60">
                        {getVitalsHistory().filter(v => v.weight || v.bmi).length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getVitalsHistory()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                              <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} />
                              <YAxis yAxisId="left" orientation="left" stroke="#10b981" fontSize={10} label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', fill: '#10b981', style: {fontSize: 10} }} />
                              <YAxis yAxisId="right" orientation="right" stroke="#6366f1" fontSize={10} label={{ value: 'BMI', angle: 90, position: 'insideRight', fill: '#6366f1', style: {fontSize: 10} }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff15', borderRadius: '8px' }}
                                labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                                itemStyle={{ fontSize: '11px' }}
                              />
                              <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                              <Line yAxisId="left" type="monotone" dataKey="weight" name="Weight (kg)" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                              <Line yAxisId="right" type="monotone" dataKey="bmi" name="BMI" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-text-muted text-sm italic">No weight/BMI logs recorded</div>
                        )}
                      </div>
                    </div>

                    {/* Blood Pressure (BP) Trend */}
                    <div className="bg-card border border-border p-5 rounded-xl shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-rose-400" /> Blood Pressure Trend
                      </h3>
                      <div className="h-60">
                        {getVitalsHistory().filter(v => v.systolic || v.diastolic).length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getVitalsHistory()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                              <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} />
                              <YAxis stroke="#ffffff40" fontSize={10} label={{ value: 'mmHg', angle: -90, position: 'insideLeft', fill: '#ffffff40', style: {fontSize: 10} }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff15', borderRadius: '8px' }}
                                labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                                itemStyle={{ fontSize: '11px' }}
                              />
                              <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                              <Line type="monotone" dataKey="systolic" name="Systolic BP" stroke="#f43f5e" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                              <Line type="monotone" dataKey="diastolic" name="Diastolic BP" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-text-muted text-sm italic">No Blood Pressure logs recorded</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Heart Rate (Pulse) & SpO2 Trend */}
                    <div className="bg-card border border-border p-5 rounded-xl shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-amber-400" /> Pulse & SpO2 Trend
                      </h3>
                      <div className="h-60">
                        {getVitalsHistory().filter(v => v.pulse || v.spo2).length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getVitalsHistory()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                              <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} />
                              <YAxis yAxisId="left" orientation="left" stroke="#f59e0b" fontSize={10} label={{ value: 'Pulse (bpm)', angle: -90, position: 'insideLeft', fill: '#f59e0b', style: {fontSize: 10} }} />
                              <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={10} label={{ value: 'SpO2 (%)', angle: 90, position: 'insideRight', fill: '#06b6d4', style: {fontSize: 10} }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff15', borderRadius: '8px' }}
                                labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                                itemStyle={{ fontSize: '11px' }}
                              />
                              <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                              <Line yAxisId="left" type="monotone" dataKey="pulse" name="Pulse (bpm)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                              <Line yAxisId="right" type="monotone" dataKey="spo2" name="SpO2 (%)" stroke="#06b6d4" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-text-muted text-sm italic">No Pulse/SpO2 logs recorded</div>
                        )}
                      </div>
                    </div>

                    {/* Prescription Frequency Analytics */}
                    <div className="bg-card border border-border p-5 rounded-xl shadow-lg">
                      <h3 className="text-sm font-bold uppercase text-text-muted mb-4 tracking-wider flex items-center gap-2">
                        <Pill size={16} className="text-pink-400" /> Top Prescribed Medicines
                      </h3>
                      <div className="h-60 flex flex-col justify-center">
                        {getMostPrescribedMedicines().length > 0 ? (
                          <div className="space-y-4">
                            {getMostPrescribedMedicines().map(({ name, count }: any) => {
                              const maxCount = Math.max(...getMostPrescribedMedicines().map(m => m.count)) || 1;
                              const pct = ((count / maxCount) * 100).toFixed(0);
                              return (
                                <div key={name} className="space-y-1">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-text-primary truncate max-w-[250px]" title={name}>{name}</span>
                                    <span className="text-text-muted">{count} time{count > 1 ? 's' : ''}</span>
                                  </div>
                                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-pink-500 h-full rounded-full transition-all duration-500" 
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center text-text-muted text-sm italic">No medicine history found</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Prescription Preview Modal for History */}
      {selectedPatient && viewPrescription && (
        <PrescriptionModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => setPrescriptionModalOpen(false)}
          patient={{...selectedPatient, visitCount: viewPrescription.visitCount}}
          viewOnlyRecord={isRxViewOnly ? viewPrescription : undefined}
        />
      )}

      {/* FULL SCREEN INVOICE PREVIEW MODAL */}
      <AnimatePresence>
        {isBillPreviewOpen && viewingBill && selectedPatient && (() => {
          const settings = pageSettings || {
            doctor_id: '',
            paper_size: 'A4',
            header_enabled: 1,
            margin_top_cm: 2.0,
            margin_left_cm: 2.0,
            margin_right_cm: 2.0,
            margin_bottom_cm: 2.0
          };

          const getFontSize = (paperSize: 'A4' | 'A5') => {
            const numItems = viewingBill?.items?.length || 0;
            if (paperSize === 'A5') {
              if (numItems > 12) return '9px';
              if (numItems > 8) return '10px';
              if (numItems > 5) return '11px';
              return '12px';
            } else {
              // A4
              if (numItems > 15) return '11px';
              if (numItems > 10) return '12px';
              if (numItems > 6) return '13px';
              return '14px';
            }
          };

          const baseFontSize = getFontSize(settings.paper_size);

          return (
            <div className="fixed inset-0 z-[100] flex bg-[#1e1e24] text-white modal-backdrop print-modal-container font-sans">
              {/* Left Control Panel */}
              <div className="w-80 md:w-96 bg-[#2d2d34] border-r border-[#3f3f46] p-6 flex flex-col justify-between overflow-y-auto no-print">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                    <button 
                      onClick={() => setViewingBill(null)}
                      className="p-2 hover:bg-white/5 rounded-full transition-colors"
                      title="Go Back"
                    >
                      <ArrowLeft size={20} className="text-white/80" />
                    </button>
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-wide">Print Hub</h2>
                      <p className="text-xs text-text-muted">Configure invoice layout</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <Button 
                      onClick={handlePrint} 
                      className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl shadow-lg shadow-primary/20 transition-all border-none animate-pulse"
                    >
                      <Printer size={18} /> Print Invoice
                    </Button>
                    <Button 
                      onClick={handleWhatsAppBilling} 
                      className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-sm rounded-xl transition-all border-none"
                    >
                      <MessageSquare size={18} /> WhatsApp Share
                    </Button>
                  </div>

                  <div className="h-px bg-white/10" />

                  {/* Settings list */}
                  <div className="space-y-5">
                    <h3 className="text-xs font-bold uppercase text-white/50 tracking-wider">Page Settings</h3>

                    {/* Paper Size */}
                    <div className="space-y-2">
                      <label className="text-xs text-white/70 font-semibold block">Paper Size</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updatePageSetting('paper_size', 'A4')}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            settings.paper_size === 'A4' 
                              ? 'bg-primary/20 border-primary text-primary' 
                              : 'bg-[#2a2a32] border-white/10 text-white/60 hover:bg-[#32323c]'
                          }`}
                        >
                          A4 (Standard)
                        </button>
                        <button
                          onClick={() => updatePageSetting('paper_size', 'A5')}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            settings.paper_size === 'A5' 
                              ? 'bg-primary/20 border-primary text-primary' 
                              : 'bg-[#2a2a32] border-white/10 text-white/60 hover:bg-[#32323c]'
                          }`}
                        >
                          A5 (Half Size)
                        </button>
                      </div>
                    </div>

                    {/* Header Toggle */}
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-xs text-white/80 font-semibold">Include Clinic Header</span>
                      <button
                        onClick={() => updatePageSetting('header_enabled', settings.header_enabled === 1 ? 0 : 1)}
                        className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 ${
                          settings.header_enabled === 1 ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                          settings.header_enabled === 1 ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {/* Margins */}
                    <div className="space-y-4">
                      <span className="text-xs text-white/70 font-semibold block">Margins (cm)</span>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-white/60">
                          <span>Top Margin</span>
                          <span className="font-mono">{settings.margin_top_cm.toFixed(1)} cm</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="5.0"
                          step="0.1"
                          value={settings.margin_top_cm}
                          onChange={(e) => updatePageSetting('margin_top_cm', parseFloat(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-white/60">
                          <span>Bottom Margin</span>
                          <span className="font-mono">{settings.margin_bottom_cm.toFixed(1)} cm</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="5.0"
                          step="0.1"
                          value={settings.margin_bottom_cm}
                          onChange={(e) => updatePageSetting('margin_bottom_cm', parseFloat(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-white/60">
                          <span>Left Margin</span>
                          <span className="font-mono">{settings.margin_left_cm.toFixed(1)} cm</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="5.0"
                          step="0.1"
                          value={settings.margin_left_cm}
                          onChange={(e) => updatePageSetting('margin_left_cm', parseFloat(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-white/60">
                          <span>Right Margin</span>
                          <span className="font-mono">{settings.margin_right_cm.toFixed(1)} cm</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="5.0"
                          step="0.1"
                          value={settings.margin_right_cm}
                          onChange={(e) => updatePageSetting('margin_right_cm', parseFloat(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-[10px] text-white/40 text-center border-t border-white/5 pt-4 mt-6">
                  Settings are auto-saved for this doctor.
                </div>
              </div>

              {/* Right Preview Viewport */}
              <div className="flex-1 bg-[#121214] p-8 overflow-y-auto flex justify-center items-start print-preview-viewport custom-scrollbar">
                <div
                  ref={printAreaRef}
                  className="printable-area bg-white text-black shadow-2xl relative transition-all"
                  style={{
                    width: settings.paper_size === 'A5' ? '14.8cm' : '21cm',
                    minHeight: settings.paper_size === 'A5' ? '21cm' : '29.7cm',
                    paddingTop: `${settings.margin_top_cm}cm`,
                    paddingBottom: `${settings.margin_bottom_cm}cm`,
                    paddingLeft: `${settings.margin_left_cm}cm`,
                    paddingRight: `${settings.margin_right_cm}cm`,
                    boxSizing: 'border-box',
                    zoom: printZoom
                  }}
                >
                  {/* Dynamic Print Styles */}
                  <style>
                    {`
                      .printable-area {
                        font-size: ${baseFontSize} !important;
                      }
                      .printable-area h1, .printable-area .text-3xl, .printable-area .text-2xl {
                        font-size: 1.4em !important;
                      }
                      .printable-area h2, .printable-area .text-xl, .printable-area .text-lg {
                        font-size: 1.15em !important;
                      }
                      .printable-area table, .printable-area .text-sm, .printable-area .text-base, .printable-area p, .printable-area td, .printable-area th, .printable-area span, .printable-area div {
                        font-size: 1em !important;
                      }
                      .printable-area .text-xs {
                        font-size: 0.85em !important;
                      }
                      .printable-area .text-[10px] {
                        font-size: 0.75em !important;
                      }
                      .printable-area .mb-6 { margin-bottom: 1.2em !important; }
                      .printable-area .mb-8 { margin-bottom: 1.5em !important; }
                      .printable-area .mb-4 { margin-bottom: 0.8em !important; }
                      .printable-area .mb-3 { margin-bottom: 0.6em !important; }
                      .printable-area .pb-4 { padding-bottom: 0.8em !important; }
                      .printable-area .pb-6 { padding-bottom: 1.2em !important; }
                      .printable-area .pt-12 { padding-top: 2.2em !important; }

                      @media print {
                        @page {
                          size: ${settings.paper_size || 'A4'} portrait;
                          margin: 0 !important;
                        }
                        body {
                          background: white !important;
                          color: black !important;
                        }
                        .no-print {
                          display: none !important;
                        }
                        body > *:not(#root) {
                          display: none !important;
                        }
                        .print-modal-container {
                          position: static !important;
                          display: block !important;
                          background: white !important;
                          color: black !important;
                          width: 100% !important;
                          height: auto !important;
                          overflow: visible !important;
                        }
                        .print-preview-viewport {
                          padding: 0 !important;
                          margin: 0 !important;
                          background: white !important;
                          overflow: visible !important;
                          display: block !important;
                          width: 100% !important;
                          height: auto !important;
                        }
                        .printable-area {
                          box-shadow: none !important;
                          border: none !important;
                          width: 100% !important;
                          height: auto !important;
                          min-height: 0 !important;
                          padding-top: ${settings.margin_top_cm}cm !important;
                          padding-bottom: ${settings.margin_bottom_cm}cm !important;
                          padding-left: ${settings.margin_left_cm}cm !important;
                          padding-right: ${settings.margin_right_cm}cm !important;
                          margin: 0 !important;
                          zoom: 1 !important;
                          -webkit-print-color-adjust: exact;
                          print-color-adjust: exact;
                        }
                      }
                    `}
                  </style>

                  {/* Hospital Header */}
                  {settings.header_enabled !== 0 && (
                    <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
                      <div>
                        <h1 className="text-2xl font-heading font-bold text-green-700 uppercase">{masterData?.clinicName || 'SHREE AROGYALAYA HOSPITAL'}</h1>
                        <div className="mt-2 text-sm text-gray-600 space-y-1">
                          <p>{masterData?.clinicAddress || '123, Health Avenue, Mumbai - 400001'}</p>
                          <p>{masterData?.clinicContact || 'Ph: +91 98765 43210'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="bg-gray-100 px-4 py-2 rounded border border-gray-200 inline-block text-center min-w-[140px]">
                          <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide">Invoice No</h3>
                          <p className="text-xl font-mono font-bold text-black">#{viewingBill.billNo}</p>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">Date: {formatDate(viewingBill.date)}</p>
                      </div>
                    </div>
                  )}

                  {/* Patient & Invoice Info - If header is disabled, make sure date and bill no are still here */}
                  {settings.header_enabled === 0 && (
                    <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-6">
                      <p className="text-sm font-bold">Invoice: #{viewingBill.billNo}</p>
                      <p className="text-sm font-bold">Date: {formatDate(viewingBill.date)}</p>
                    </div>
                  )}

                  {/* Patient & Invoice Info */}
                  <div className="grid grid-cols-2 gap-12 mb-8">
                    <div>
                      <h3 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-3">Bill To</h3>
                      <p className="text-lg font-bold text-black uppercase">{selectedPatient.title} {selectedPatient.firstName} {selectedPatient.lastName}</p>
                      <div className="text-sm text-gray-700 mt-2 space-y-1">
                        <p><span className="font-medium">UHID:</span> {selectedPatient.uhid}</p>
                        <p><span className="font-medium">Age/Sex:</span> {selectedPatient.age} Yrs / {selectedPatient.sex}</p>
                        <p><span className="font-medium">Mobile:</span> {selectedPatient.mobile}</p>
                        <p><span className="font-medium">Address:</span> {selectedPatient.address || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-3">Consultation Details</h3>
                      <div className="text-sm text-gray-700 mt-2 space-y-1">
                        <p><span className="font-medium">Consultant:</span> {viewingBill.consultant}</p>
                        <p><span className="font-medium">Visit No:</span> <span className="font-bold text-black text-base">{viewingBill.visitCount ? `Visit ${viewingBill.visitCount}` : 'Visit 1'}</span></p>
                        <p><span className="font-medium">Payment By:</span> {selectedPatient.paymentBy}</p>
                        <p><span className="font-medium">Payment Mode:</span> <span className="font-bold text-black">{viewingBill.paymentMode || 'CASH'}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Bill Table */}
                  <div className="mb-8">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-y border-black">
                          <th className="py-3 px-2 text-left text-sm font-bold uppercase text-gray-700 w-12">#</th>
                          <th className="py-3 px-2 text-left text-sm font-bold uppercase text-gray-700">Particulars</th>
                          <th className="py-3 px-2 text-right text-sm font-bold uppercase text-gray-700 w-24">Rate</th>
                          <th className="py-3 px-2 text-right text-sm font-bold uppercase text-gray-700 w-24">Qty</th>
                          <th className="py-3 px-2 text-right text-sm font-bold uppercase text-gray-700 w-32">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-gray-800">
                        {viewingBill.items.map((item, index) => (
                          <tr key={item.id} className="border-b border-gray-200">
                            <td className="py-3 px-2">{index + 1}</td>
                            <td className="py-3 px-2 font-medium">{item.particulars}</td>
                            <td className="py-3 px-2 text-right">{item.rate.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right">{item.quantity}</td>
                            <td className="py-3 px-2 text-right font-bold">₹{item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end mb-12">
                    <div className="w-64 space-y-2">
                       <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Sub-Total:</span>
                        <span className="font-medium">₹{viewingBill.total.toFixed(2)}</span>
                      </div>
                      
                      {isEnabled(masterData?.enableDiscount) && (viewingBill.discountValue || 0) > 0 && (
                        <div className="flex justify-between text-sm text-red-600">
                          <span>Discount {viewingBill.discountType === 'Percentage' ? `(${viewingBill.discountValue}%)` : ''}:</span>
                          <span>- ₹{calculateDiscount(viewingBill).toFixed(2)}</span>
                        </div>
                      )}

                      {isEnabled(masterData?.enableGst) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">GST ({masterData.gstRate || 18}%):</span>
                          <span>+ ₹{calculateTax(viewingBill).toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between border-t border-gray-800 pt-2 mt-2">
                        <span className="text-base font-bold uppercase">Net Amount:</span>
                        <span className="text-lg font-bold">₹{calculateNet(viewingBill).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-end mt-auto pt-12">
                    <div className="text-xs text-gray-500 max-w-sm">
                      <p className="font-bold mb-1">Terms & Conditions:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Payment once made is generally not refundable.</li>
                        <li>This is a computer generated invoice and does not require a physical signature.</li>
                      </ul>
                    </div>
                    <div className="text-center">
                      <div className="h-16 w-40 border-b border-black mb-2 flex items-end justify-center"></div>
                      <p className="text-sm font-bold uppercase text-gray-700">Authorized Signatory</p>
                    </div>
                  </div>

                  {/* Print Time */}
                  <div className="mt-8 pt-4 border-t border-gray-200 text-center">
                    <p className="text-[10px] text-gray-400">Printed on {new Date().toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
