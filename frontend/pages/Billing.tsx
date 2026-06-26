
import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, Select, Modal, Table } from '../components/UI';
import { Patient, Bill, BillItem, User, UserRole, MasterData, DoctorPageSettings } from '../types';
import { getPatients, saveBill, generateBillNo, getBills, getPatientByUHID, formatDate, getStoredAuth, getAllVisits, getDoctorPageSettings, saveDoctorPageSettings, getUsers, API_BASE_URL } from '../services/storage';
import { Plus, Trash2, Printer, Eye, X, FileText, Activity, Clock, Edit, ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMasterData } from '../MasterContext';
import { formatBillingMessage, sendWhatsAppMessage } from '../services/whatsapp';
import { MessageSquare } from 'lucide-react';
import { useLocation } from 'react-router-dom';

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

export const Billing: React.FC = () => {
  const { masterData } = useMasterData();
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [filteredVisits, setFilteredVisits] = useState<VisitRow[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // History Selection State
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);

  // Create Bill Modal State
  const [isBillModalOpen, setBillModalOpen] = useState(false);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);

  // Invoice Preview State
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [invoicePatient, setInvoicePatient] = useState<Patient | null>(null);

  // Bill Form State
  const [currentBillItems, setCurrentBillItems] = useState<BillItem[]>([]);
  const [currentItem, setCurrentItem] = useState({ particular: '', qty: 1, rate: 0 });
  const [generatedBillNo, setGeneratedBillNo] = useState('');

  // New Billing Fields
  const [discountType, setDiscountType] = useState<'Percentage' | 'Fixed'>('Fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('CASH');

  // Page Settings for Print
  const [pageSettings, setPageSettings] = useState<DoctorPageSettings | null>(null);
  const [printZoom, setPrintZoom] = useState(1.0);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const enterPressRef = React.useRef<number>(0);
  const saveCurrentBillRef = React.useRef<() => void>(() => {});

  const getUniqueBillNo = () => {
    let billNo = "";
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 100) {
      billNo = Math.floor(1000 + Math.random() * 9000).toString();
      isUnique = !bills.some(b => b.billNo === billNo);
      attempts++;
    }
    return billNo;
  };

  const formatPrintDate = (isoDate: string | undefined): string => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
    }
    return isoDate;
  };
  useEffect(() => {
    // Load data
    const loadData = async () => {
      const [v, user, b] = await Promise.all([
        getAllVisits(),
        Promise.resolve(getStoredAuth()),
        getBills()
      ]);

      setVisits(v);
      setBills(b);
      setCurrentUser(user);
    };
    loadData();
  }, [viewingBill]);

  // Handle masterData specific initialization
  useEffect(() => {
    if (masterData && masterData.billParticulars && masterData.billParticulars.length > 0) {
      if (!currentItem.particular) {
        setCurrentItem({
          particular: masterData.billParticulars[0].name,
          qty: 1,
          rate: masterData.billParticulars[0].defaultRate
        });
      }
    }
  }, [masterData]);


  // Filter Visits by Date AND Consultant (if Doctor)
  useEffect(() => {
    if (visits.length > 0) {
      let filtered = visits.filter(v => v.visitDate === selectedDate);

      // Data Leakage Fix: If user is a DOCTOR, only show their patients
      if (currentUser && currentUser.role === UserRole.DOCTOR) {
        filtered = filtered.filter(v => v.consultantName === currentUser.name);
      }

      setFilteredVisits(filtered);
    } else {
      setFilteredVisits([]);
    }
  }, [selectedDate, visits, currentUser]);

  // Handle incoming edit request from location state
  useEffect(() => {
    if (location.state?.editBill && visits.length > 0) {
      const bill = location.state.editBill;
      // Find the corresponding visit to build a patient object
      const v = visits.find(v => v.uhid === bill.uhid && v.visitCount === bill.visitCount);
      if (v) {
        const patientLike: Patient = {
          uhid: v.uhid, date: v.visitDate, userType: v.userType as any,
          title: v.title, firstName: v.firstName, middleName: v.middleName,
          lastName: v.lastName, birthDate: v.birthDate || '', age: v.age,
          sex: v.sex as any, address: v.address, state: v.state, city: v.city,
          taluka: v.taluka, mobile: v.mobile, email: v.email,
          referredBy: v.referredBy || '', paymentBy: v.paymentBy || '',
          consultantName: v.consultantName, idProofType: v.idProofType || '',
          idProofNumber: v.idProofNumber || '', purposeOfVisit: v.purposeOfVisit || '',
          visitCount: v.visitCount
        };
        openBillModal(patientLike);
      }
    }
  }, [location.state, visits]);

  const handlePatientSelect = async (patient: Patient) => {
    // Optionally fetch history if history sidebar shows more than just bills
    // In current Billing.tsx, it mostly shows historical bills.
    setHistoryPatient(patient);
  };

  const openBillModal = (patient: Patient) => {
    setActivePatient(patient);
    setHistoryPatient(patient); // Also select for history view

    // Check if a bill already exists for this visit
    const currentVisit = patient.visitCount || 1;
    const existingBill = bills.find(b => b.uhid === patient.uhid && b.visitCount === currentVisit);

    if (existingBill) {
      // Load existing bill for editing
      setGeneratedBillNo(existingBill.billNo);
      setCurrentBillItems(existingBill.items);
      setDiscountType(existingBill.discountType || 'Fixed');
      setDiscountValue(existingBill.discountValue || 0);
      setPaymentMode(existingBill.paymentMode || 'CASH');
    } else {
      // Create new
      setGeneratedBillNo(getUniqueBillNo());
      setCurrentBillItems([]);
      setDiscountType('Fixed');
      setDiscountValue(0);
      setPaymentMode('CASH');
    }

    if (masterData.billParticulars.length > 0) {
      setCurrentItem({ particular: masterData.billParticulars[0].name, qty: 1, rate: masterData.billParticulars[0].defaultRate });
    }
    setBillModalOpen(true);
  };

  const handleAddItem = () => {
    const newItem: BillItem = {
      id: Math.random().toString(),
      particulars: currentItem.particular,
      quantity: 1,
      rate: currentItem.rate,
      amount: currentItem.rate
    };
    setCurrentBillItems([...currentBillItems, newItem]);
  };

  const handleParticularChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const ref = masterData.billParticulars.find(p => p.name === val);
    setCurrentItem({ ...currentItem, particular: val, rate: ref?.defaultRate || 0 });
  };

  const removeItem = (id: string) => {
    setCurrentBillItems(currentBillItems.filter(i => i.id !== id));
  };

  const getSubTotal = () => currentBillItems.reduce((sum, item) => sum + item.amount, 0);

  // AUTO-ADJUST: If items removed, ensure fixed discount doesn't exceed new subtotal
  useEffect(() => {
    const sub = getSubTotal();
    if (discountType === 'Fixed' && discountValue > sub) {
      setDiscountValue(sub);
    }
  }, [currentBillItems, discountType]);

  const calculateFinals = (subTotal: number, dType: 'Percentage' | 'Fixed', dVal: number) => {
    let discountAmount = 0;
    let effectiveVal = dVal || 0;

    if (masterData?.enableDiscount) {
      if (dType === 'Percentage') {
        discountAmount = (subTotal * Math.min(effectiveVal, 100)) / 100;
      } else {
        discountAmount = Math.min(effectiveVal, subTotal);
      }
    }

    const taxable = Math.max(0, subTotal - discountAmount);
    // Use configured GST Rate
    const gstPercent = masterData.gstRate || 18;
    const tax = masterData.enableGst ? taxable * (gstPercent / 100) : 0;
    const netTotal = taxable + tax;
    return { discountAmount, taxable, tax, netTotal };
  };

  // --- Auto-scale billing print to fit one page ---
  useEffect(() => {
    if (!viewingBill || !invoicePatient) {
      setPrintZoom(1.0);
      return;
    }
    // Wait one frame for content to fully render
    const id = setTimeout(() => {
      if (!printAreaRef.current) return;
      const contentH = printAreaRef.current.scrollHeight;
      // A4 at 96dpi ≈ 1123px total page, A5 ≈ 794px
      const isA4 = (pageSettings?.paper_size || 'A4') === 'A4';
      const pageHeightPx = isA4 ? 1123 : 794;
      const PX_PER_CM = 37.8; // 1 cm ≈ 37.8 px at 96 dpi
      const mt = (pageSettings?.margin_top_cm ?? 2) * PX_PER_CM;
      const mb = (pageSettings?.margin_bottom_cm ?? 2) * PX_PER_CM;
      const usable = pageHeightPx - mt - mb;
      if (contentH > usable) {
        // Clamp zoom floor at 0.5 (very dense content)
        const zoom = Math.max(0.5, usable / contentH);
        setPrintZoom(parseFloat(zoom.toFixed(3)));
      } else {
        setPrintZoom(1.0);
      }
    }, 120);
    return () => clearTimeout(id);
  }, [viewingBill, invoicePatient, pageSettings]);

  const saveCurrentBill = async () => {
    if (!activePatient) return;

    const subTotal = getSubTotal();

    // Recalculate finals to clamp any lingering invalid discount values before saving
    const { discountAmount } = calculateFinals(subTotal, discountType, discountValue);

    // If it was percentage, keep percentage value (it's ratio based), if fixed, use the clamped amount
    const finalDiscountValue = discountType === 'Fixed' ? discountAmount : Math.min(discountValue, 100);

    const bill: Bill = {
      billNo: generatedBillNo,
      uhid: activePatient.uhid,
      patientName: `${activePatient.firstName} ${activePatient.lastName}`,
      date: activePatient.date || new Date().toISOString().split('T')[0],
      consultant: activePatient.consultantName,
      items: currentBillItems,
      total: subTotal, // Store SubTotal as total for schema compatibility
      visitCount: activePatient.visitCount || 1,

      // New Fields
      paymentMode,
      discountType,
      discountValue: finalDiscountValue
    };

    await saveBill(bill);

    // Update local bills state immediately to reflect in history (handle Update vs Insert)
    setBills(prev => {
      const idx = prev.findIndex(b => b.billNo === bill.billNo);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = bill;
        return updated;
      }
      return [bill, ...prev];
    });

    setBillModalOpen(false);

    // Open Invoice Immediately
    handleViewBill(bill);
  };
  
  saveCurrentBillRef.current = () => { if (currentBillItems.length > 0) saveCurrentBill(); };

  const handleViewBill = async (bill: Bill) => {
    const [patient, allUsers] = await Promise.all([
      getPatientByUHID(bill.uhid),
      getUsers()
    ]);

    if (patient) {
      setInvoicePatient(patient);
      setViewingBill(bill);

      const consultant = allUsers.find(u => u.name === bill.consultant);
      if (consultant) {
        const settings = await getDoctorPageSettings(consultant.id);
        setPageSettings(settings);
      } else {
        setPageSettings(null);
      }
    }
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
    setPageSettings(prev => {
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
    if (!viewingBill || !invoicePatient) return;

    // Calculate final amount
    const subTotal = viewingBill.total;
    const { netTotal } = calculateFinals(subTotal, viewingBill.discountType || 'Fixed', viewingBill.discountValue || 0);

    const itemsStr = viewingBill.items.map((it, idx) =>
      `${idx + 1}. ${it.particulars}  ₹${it.amount.toFixed(2)}`
    ).join('\n');

    const msg = formatBillingMessage({
      patientTitle: invoicePatient.title,
      patientName: `${invoicePatient.firstName} ${invoicePatient.lastName}`,
      clinicName: masterData?.clinicName || 'Clinic',
      uhid: invoicePatient.uhid,
      age: invoicePatient.age,
      sex: invoicePatient.sex,
      mobile: invoicePatient.mobile,
      address: invoicePatient.address,
      consultantName: viewingBill.consultant,
      visitNo: ordinals(viewingBill.visitCount || 1) + " Visit",
      paymentBy: invoicePatient.paymentBy || 'Self',
      paymentMode: viewingBill.paymentMode,
      billItems: itemsStr,
      subTotal: subTotal.toFixed(2),
      netTotal: netTotal.toFixed(2),
      invoiceNo: viewingBill.billNo,
      date: formatPrintDate(viewingBill.date)
    });

    sendWhatsAppMessage(invoicePatient.mobile, msg);
  };

  const ordinals = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Filter bills for the selected patient and sort them Ascending by Visit Count
  const filteredBills = historyPatient
    ? bills
      .filter(b => b.uhid === historyPatient.uhid)
      .sort((a, b) => (a.visitCount || 0) - (b.visitCount || 0) || a.date.localeCompare(b.date))
    : [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingBill) {
          setViewingBill(null);
        }
      } else if (e.key === 'Enter') {
        if (isBillModalOpen && !viewingBill) {
            const target = e.target as HTMLElement;
            if (target && (target.tagName.toLowerCase() === 'textarea' || target.tagName.toLowerCase() === 'button')) return;

            const now = Date.now();
            if (now - enterPressRef.current < 500) {
                saveCurrentBillRef.current();
                enterPressRef.current = 0;
            } else {
                enterPressRef.current = now;
            }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingBill, isBillModalOpen]);

  if (!masterData) return <div className="p-8 text-white">Loading Billing Module...</div>;

  // Live Calculations for Modal
  const modalSubTotal = getSubTotal();
  const { discountAmount: modalDiscount, tax: modalTax, netTotal: modalNet } = calculateFinals(modalSubTotal, discountType, discountValue);

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-4 items-center">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">OPD Billing</h1>
          {currentUser?.role === UserRole.DOCTOR && (
            <>
              <p className="text-xs text-text-muted mt-1">Patients assigned to</p>
              <p className="text-xs text-text-muted mt-1 text-primary">{currentUser.name}</p>
            </>
          )}
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-40 bg-blue-700 p-4"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Selection List */}
        <Card title={`Patients for ${formatDate(selectedDate)}`} className="h-[500px] flex flex-col">
          <div className="flex-1 overflow-auto">
            <Table headers={['Name', 'Type', 'Status', 'Action']}>
              {filteredVisits.length > 0 ? filteredVisits.map(v => {
                const patientLike: Patient = {
                  uhid: v.uhid, date: v.registrationDate, userType: v.userType as any,
                  title: v.title, firstName: v.firstName, middleName: v.middleName,
                  lastName: v.lastName, birthDate: v.birthDate || '', age: v.age,
                  sex: v.sex as any, address: v.address, state: v.state, city: v.city,
                  taluka: v.taluka, mobile: v.mobile, email: v.email,
                  referredBy: v.referredBy || '', paymentBy: v.paymentBy || '',
                  consultantName: v.consultantName, idProofType: v.idProofType || '',
                  idProofNumber: v.idProofNumber || '', purposeOfVisit: v.purposeOfVisit || '',
                  visitCount: v.visitCount
                };

                return (
                  <tr
                    key={`${v.uhid}-${v.visitCount}`}
                    className={`cursor-pointer transition-colors ${historyPatient?.uhid === v.uhid ? 'bg-primary/20 border-l-4 border-l-primary' : 'hover:bg-white/5'}`}
                    onClick={() => handlePatientSelect(patientLike)}
                    onDoubleClick={() => openBillModal(patientLike)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div>{v.firstName} {v.lastName}</div>
                      <div className="text-[10px] text-text-muted font-mono">{v.uhid} | Visit #{v.visitCount}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${v.userType === 'New' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                        {v.userType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {v.prescriptionCount > 0 ? (
                        <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                          <Activity size={10} /> Checked
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted opacity-50 flex items-center gap-1">
                          <Clock size={10} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); openBillModal(patientLike); }}>Bill</Button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                    No patients found for this date.
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Card>

        {/* Patient Specific Bill History */}
        <Card
          title={historyPatient ? `Bill History: ${historyPatient.firstName} ${historyPatient.lastName}` : "Patient Bill History"}
          className="h-[500px] flex flex-col"
        >
          <div className="flex-1 overflow-auto relative">
            {!historyPatient ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted opacity-60">
                <FileText size={48} className="mb-4" />
                <p className="text-lg font-medium">Please select a patient</p>
                <p className="text-sm">Click on a patient to view their billing history</p>
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted opacity-60">
                <p>No billing history found for this patient.</p>
              </div>
            ) : (
              <Table headers={['Date', 'Bill No', 'Total', 'Visit', 'Actions']}>
                {filteredBills.map((b, index) => {
                  const { netTotal } = calculateFinals(b.total, b.discountType || 'Fixed', b.discountValue || 0);
                  return (
                    <tr key={b.billNo} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm">{formatDate(b.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {b.billNo}
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">₹{netTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs">{b.visitCount ? ordinals(b.visitCount) : '-'}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button
                          onClick={() => handleViewBill(b)}
                          className="text-secondary hover:text-blue-400 p-1"
                          title="View & Print"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openBillModal({...historyPatient!, visitCount: b.visitCount})}
                          className="text-primary hover:text-green-400 p-1"
                          title="Edit Bill"
                        >
                          <Edit size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </div>
        </Card>
      </div>

      {/* Create Bill Modal */}
      {activePatient && (
        <Modal
          isOpen={isBillModalOpen}
          onClose={() => setBillModalOpen(false)}
          title={`Generate Bill #${generatedBillNo}`}
          size="lg"
        >
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-3 gap-4 bg-background/50 p-4 rounded-lg border border-border">
              <div>
                <label className="text-xs text-text-muted uppercase">Patient Name</label>
                <p className="font-medium">{activePatient.title} {activePatient.firstName} {activePatient.lastName}</p>
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase">UHID</label>
                <p className="font-mono text-primary">{activePatient.uhid}</p>
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase">Consultant</label>
                <p>{activePatient.consultantName}</p>
              </div>
            </div>

            {/* Item Entry */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-card p-4 rounded-lg border border-border">
              <div className="w-full md:flex-1">
                <Select
                  label="Particulars"
                  options={masterData.billParticulars.map(b => ({ value: b.name, label: b.name }))}
                  value={currentItem.particular}
                  onChange={handleParticularChange}
                />
              </div>
              <div className="w-full md:w-32">
                <Input
                  label="Rate"
                  type="number"
                  value={currentItem.rate}
                  onChange={(e) => setCurrentItem({ ...currentItem, rate: parseFloat(e.target.value) })}
                />
              </div>
              <Button type="button" onClick={handleAddItem} className="w-full md:w-auto mb-[2px] py-3 md:py-2"><Plus size={18} className="mr-2 md:mr-0" /> <span className="md:hidden">Add Item</span></Button>
            </div>

            {/* Items Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-background text-text-muted uppercase text-xs">
                  <tr>
                    <th className="px-4 py-2">Particular</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentBillItems.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">{item.particulars}</td>
                      <td className="px-4 py-2 text-right">{item.rate}</td>
                      <td className="px-4 py-2 text-right">{item.amount}</td>
                      <td className="px-4 py-2 text-center">
                        <button type="button" onClick={() => removeItem(item.id)} className="text-danger hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {currentBillItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No items added</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Discount & Payment Section */}
            <div className="grid grid-cols-2 gap-6 bg-background/50 p-4 rounded-lg border border-border">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-text-muted">Discount & Payment</h3>
                <div className="grid grid-cols-2 gap-2">
                  {masterData.enableDiscount ? (
                    <>
                      <Select
                        label="Discount Type"
                        options={[{ value: 'Fixed', label: 'Fixed (₹)' }, { value: 'Percentage', label: 'Percentage (%)' }]}
                        value={discountType}
                        onChange={(e) => {
                          setDiscountType(e.target.value as any);
                          setDiscountValue(0);
                        }}
                      />
                      <Input
                        label="Discount Value"
                        type="number"
                        min="0"
                        value={discountValue}
                        onChange={(e) => {
                          let val = parseFloat(e.target.value) || 0;
                          if (val < 0) val = 0;
                          if (discountType === 'Percentage') {
                            if (val > 100) val = 100;
                          } else {
                            const sub = getSubTotal();
                            if (val > sub) val = sub;
                          }
                          setDiscountValue(val);
                        }}
                      />
                    </>
                  ) : (
                    <div className="col-span-2 flex items-center justify-center border border-dashed border-border rounded text-text-muted text-xs italic">
                      Discounts Disabled by Admin
                    </div>
                  )}
                </div>
                <Select
                  label="Payment Mode"
                  options={masterData.paymentModes.map(m => ({ value: m, label: m }))}
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                />
              </div>
              <div className="space-y-2 text-right text-sm">
                <div className="flex justify-between text-text-muted">
                  <span>Sub Total:</span>
                  <span>₹{modalSubTotal.toFixed(2)}</span>
                </div>
                {masterData.enableDiscount && (
                  <div className="flex justify-between text-text-muted">
                    <span>Discount {discountType === 'Percentage' ? `(${discountValue}%)` : ''}:</span>
                    <span className="text-red-400">- ₹{modalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-muted border-b border-border pb-2">
                  <span>Tax ({masterData.gstRate || 18}% GST) {masterData.enableGst ? '' : '(Disabled)'}:</span>
                  <span>+ ₹{modalTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-primary pt-1">
                  <span>Net Total:</span>
                  <span>₹{modalNet.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setBillModalOpen(false)}>Cancel</Button>
              <Button type="button" onClick={saveCurrentBill} disabled={currentBillItems.length === 0}>Save & Print</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* FULL SCREEN INVOICE MODAL (FOR VIEWING & PRINTING) */}
      <AnimatePresence>
        {viewingBill && invoicePatient && (() => {
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

                  {/* hospital Header - Conditionally Hidden */}
                  {settings.header_enabled !== 0 && (
                    <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
                      <div className="flex items-center gap-4">
                        {masterData?.clinicProfile?.logo && (
                          <img 
                            src={masterData.clinicProfile.logo} 
                            alt="Logo" 
                            className="h-16 w-16 object-contain" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <div>
                          <h1 className="text-2xl font-heading font-bold text-green-700 uppercase">
                            {masterData?.clinicProfile?.hospital_name || masterData?.clinicName || 'SHREE AROGYALAYA HOSPITAL'}
                          </h1>
                          {masterData?.clinicProfile?.clinic_name && masterData?.clinicProfile?.clinic_name !== masterData?.clinicProfile?.hospital_name && (
                            <p className="text-sm font-bold text-green-600 uppercase">{masterData.clinicProfile.clinic_name}</p>
                          )}
                          <div className="mt-2 text-sm text-gray-600 space-y-1">
                            <p>{masterData?.clinicAddress || '123, Health Avenue, Mumbai - 400001'}</p>
                            <p>{masterData?.clinicContact || 'Ph: +91 98765 43210'}</p>
                            {(masterData?.clinicProfile?.gst_number || masterData?.clinicProfile?.registration_number) && (
                              <p className="text-xs">
                                {masterData?.clinicProfile?.gst_number ? `GST: ${masterData.clinicProfile.gst_number}` : ''}
                                {masterData?.clinicProfile?.gst_number && masterData?.clinicProfile?.registration_number ? ' | ' : ''}
                                {masterData?.clinicProfile?.registration_number ? `Reg: ${masterData.clinicProfile.registration_number}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="bg-gray-100 px-4 py-2 rounded border border-gray-200 inline-block text-center min-w-[140px]">
                          <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide">Invoice No</h3>
                          <p className="text-xl font-mono font-bold text-black">#{viewingBill.billNo}</p>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">Date: {formatPrintDate(viewingBill.date)}</p>
                      </div>
                    </div>
                  )}

                  {/* Patient & Invoice Info - If header is disabled, make sure date and bill no are still here */}
                  {settings.header_enabled === 0 && (
                    <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-6">
                      <p className="text-sm font-bold">Invoice: #{viewingBill.billNo}</p>
                      <p className="text-sm font-bold">Date: {formatPrintDate(viewingBill.date)}</p>
                    </div>
                  )}

                  {/* Patient & Invoice Info */}
                  <div className="grid grid-cols-2 gap-12 mb-8">
                    <div>
                      <h3 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-3">Bill To</h3>
                      <p className="text-lg font-bold text-black uppercase">{invoicePatient.title} {invoicePatient.firstName} {invoicePatient.middleName ? invoicePatient.middleName + ' ' : ''}{invoicePatient.lastName}</p>
                      <div className="text-sm text-gray-700 mt-2 space-y-1">
                        <p><span className="font-medium">UHID:</span> {invoicePatient.uhid}</p>
                        <p><span className="font-medium">Age/Sex:</span> {invoicePatient.age} Yrs / {invoicePatient.sex}</p>
                        <p><span className="font-medium">Mobile:</span> {invoicePatient.mobile}</p>
                        <p><span className="font-medium">Address:</span> {invoicePatient.address || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-3">Consultation Details</h3>
                      <div className="text-sm text-gray-700 mt-2 space-y-1">
                        <p><span className="font-medium">Consultant:</span> {viewingBill.consultant}</p>
                        <p><span className="font-medium">Visit No:</span> <span className="font-bold text-black text-base">{ordinals(viewingBill.visitCount || 1)} Visit</span></p>
                        <p><span className="font-medium">Payment By:</span> {invoicePatient.paymentBy}</p>
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
                          <th className="py-3 px-2 text-right text-sm font-bold uppercase text-gray-700 w-32">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-gray-800">
                        {viewingBill.items.map((item, index) => (
                          <tr key={item.id} className="border-b border-gray-200">
                            <td className="py-3 px-2">{index + 1}</td>
                            <td className="py-3 px-2 font-medium">{item.particulars}</td>
                            <td className="py-3 px-2 text-right">{item.rate.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right font-bold">₹{item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end mb-12">
                    <div className="w-1/2">
                      {(() => {
                        const subTotal = viewingBill.total;
                        const { discountAmount, tax, netTotal } = calculateFinals(subTotal, viewingBill.discountType || 'Fixed', viewingBill.discountValue || 0);

                        return (
                          <>
                            <div className="flex justify-between py-2 border-b border-gray-200">
                              <span className="text-gray-600 text-sm">Sub Total</span>
                              <span className="font-medium">₹{subTotal.toFixed(2)}</span>
                            </div>
                            {(viewingBill.discountValue || 0) > 0 && (
                              <div className="flex justify-between py-2 border-b border-gray-200">
                                <span className="text-gray-600 text-sm">Discount {viewingBill.discountType === 'Percentage' ? `(${viewingBill.discountValue}%)` : ''}</span>
                                <span className="font-medium text-red-600">- ₹{discountAmount.toFixed(2)}</span>
                              </div>
                            )}
                            {masterData.enableGst && (
                              <div className="flex justify-between py-2 border-b border-gray-200">
                                <span className="text-gray-600 text-sm">Tax ({masterData.gstRate || 18}% GST)</span>
                                <span className="font-medium">₹{tax.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between py-3 border-b-2 border-black bg-gray-50 px-2 mt-2">
                              <span className="font-bold text-lg uppercase">Net Total</span>
                              <span className="font-bold text-xl text-green-700">₹{netTotal.toFixed(2)}</span>
                            </div>
                          </>
                        );
                      })()}
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
                      {masterData?.clinicProfile?.footer_text && (
                        <p className="mt-2 font-medium text-gray-700 italic">{masterData.clinicProfile.footer_text}</p>
                      )}
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
