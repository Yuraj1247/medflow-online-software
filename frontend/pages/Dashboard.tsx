
import React, { useEffect, useState, useMemo } from 'react';
import { Patient, UserRole, User, MasterData, Bill, PrescriptionRecord, PatientDocument } from '../types';
import { getPatients, formatDate, savePatient, getBills, getPatientHistory, getAllVisits, getPatientDocuments, uploadPatientDocument, updatePatientDocumentName, deletePatientDocument, getPatientDocumentViewUrl } from '../services/storage';
import { Card, Button, Modal, cn, Input, Select } from '../components/UI';
import { Clock, Calendar, User as UserIcon, Activity, Edit, Save, X, ChevronDown, ChevronUp, FileText, Pill, Stethoscope, IndianRupee, FolderOpen, Upload, Trash2, Eye, Edit3, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PrescriptionModal } from './PrescriptionModal';
import { AnimatePresence, motion } from 'framer-motion';
import { useMasterData } from '../MasterContext';
import { WhatsappMessaging } from './WhatsappMessaging';
import { MessageSquare } from 'lucide-react';

interface DashboardProps {
    user: User;
}

// Same interface as in PatientSearch for consistency
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

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
    const { masterData } = useMasterData();
    const [visits, setVisits] = useState<VisitRow[]>([]);
    const [filteredVisits, setFilteredVisits] = useState<VisitRow[]>([]);
    const [bills, setBills] = useState<Bill[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Modal & Editing State
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Tab State for Modal
    const [activeTab, setActiveTab] = useState<'details' | 'history' | 'digilocker'>('details');
    const [expandedVisitId, setExpandedVisitId] = useState<number | null>(null);

    // Patient Digilocker / Medical Records State
    const [documents, setDocuments] = useState<PatientDocument[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [editingDocId, setEditingDocId] = useState<number | null>(null);
    const [editingDocName, setEditingDocName] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const loadDocuments = async (uhid: string) => {
        try {
            const docs = await getPatientDocuments(uhid);
            setDocuments(docs);
        } catch (e) {
            console.error("Failed to load documents", e);
        }
    };

    useEffect(() => {
        if (selectedPatient && activeTab === 'digilocker') {
            loadDocuments(selectedPatient.uhid);
        }
    }, [selectedPatient, activeTab]);

    const handleUpload = async (files: File[]) => {
        if (!selectedPatient) return;
        setIsUploading(true);
        try {
            for (const file of files) {
                await uploadPatientDocument(selectedPatient.uhid, file);
            }
            await loadDocuments(selectedPatient.uhid);
        } catch (e: any) {
            console.error("Upload failed", e);
            alert(`Upload failed: ${e.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveDocName = async (id: number) => {
        if (!editingDocName.trim() || !selectedPatient) return;
        try {
            await updatePatientDocumentName(id, editingDocName.trim());
            setEditingDocId(null);
            await loadDocuments(selectedPatient.uhid);
        } catch (e: any) {
            console.error("Failed to rename document", e);
            alert(`Failed to rename: ${e.message}`);
        }
    };

    const handleDeleteDoc = async (id: number) => {
        if (!selectedPatient) return;
        if (!confirm("Are you sure you want to delete this document?")) return;
        try {
            await deletePatientDocument(id);
            await loadDocuments(selectedPatient.uhid);
        } catch (e: any) {
            console.error("Failed to delete document", e);
            alert(`Failed to delete: ${e.message}`);
        }
    };

    const [editFormData, setEditFormData] = useState<Patient | null>(null);
    const [showChecked, setShowChecked] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Load all data initially
        const loadData = async () => {
            try {
                const [v, b] = await Promise.all([
                    getAllVisits(),
                    getBills()
                ]);
                setVisits(v);
                setBills(b);
            } catch (error) {
                console.error("Failed to load dashboard data", error);
            }
        };
        loadData();
    }, []);


    // Filter visits whenever selectedDate or visits list changes
    useEffect(() => {
        if (visits.length > 0) {
            let filtered = visits.filter(v => v.visitDate === selectedDate);

            // Filter by Doctor if user is a doctor
            if (user.role === UserRole.DOCTOR) {
                const cleanUserName = user.name.toLowerCase().replace(/^dr\.?\s+/, '');
                filtered = filtered.filter(v => {
                    const cleanConsultantName = v.consultantName.toLowerCase().replace(/^dr\.?\s+/, '');
                    return cleanConsultantName === cleanUserName;
                });
            }

            setFilteredVisits(filtered);
        } else {
            setFilteredVisits([]);
        }
    }, [selectedDate, visits, user]);

    // Filtered result based on Slider
    const displayVisits = useMemo(() => {
        return filteredVisits.filter(v => {
            // A patient is "Checked" if both Rx and Bill are present for today
            const hasBill = bills.some(b => b.uhid === v.uhid && b.date === v.visitDate);
            const isChecked = v.prescriptionCount > 0 && hasBill;
            return showChecked ? isChecked : !isChecked;
        });
    }, [filteredVisits, showChecked, bills]);

    const handlePatientClick = async (patient: Patient) => {
        // Fetch History On-Demand
        const history = await getPatientHistory(patient.uhid);
        setSelectedPatient({ ...patient, prescriptionHistory: history });

        setIsEditing(false); // Reset edit mode
        setEditFormData(null);
        setActiveTab('details'); // Reset tab
        setExpandedVisitId(null); // Reset accordion
        setDetailsModalOpen(true);
    };

    // --- History Data Construction ---
    const patientHistory = useMemo(() => {
        if (!selectedPatient) return [];

        const pBills = bills.filter(b => b.uhid === selectedPatient.uhid);
        const pRx = selectedPatient.prescriptionHistory || [];

        // Group by Visit Count
        const visitMap = new Map<number, {
            visitCount: number;
            date: string;
            consultant: string;
            rx?: PrescriptionRecord;
            bill?: Bill;
        }>();

        // Add Rx Data
        pRx.forEach(rx => {
            const v = rx.visitCount || 0;
            if (!visitMap.has(v)) {
                visitMap.set(v, {
                    visitCount: v,
                    date: rx.date,
                    consultant: selectedPatient.consultantName, // Fallback, Rx doesn't store consultant name explicitly usually
                    rx
                });
            } else {
                const existing = visitMap.get(v)!;
                existing.rx = rx;
            }
        });

        // Add Bill Data
        pBills.forEach(bill => {
            const v = bill.visitCount || 0;
            if (!visitMap.has(v)) {
                visitMap.set(v, {
                    visitCount: v,
                    date: bill.date,
                    consultant: bill.consultant,
                    bill
                });
            } else {
                const existing = visitMap.get(v)!;
                existing.bill = bill;
                // Update consultant from bill if available (usually more accurate per visit)
                existing.consultant = bill.consultant;
            }
        });

        // Convert to array and sort descending (latest visit first)
        return Array.from(visitMap.values()).sort((a, b) => b.visitCount - a.visitCount);
    }, [selectedPatient, bills]);


    // --- Edit Logic ---
    const handleStartEdit = () => {
        if (selectedPatient) {
            setEditFormData({ ...selectedPatient });
            setIsEditing(true);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditFormData(null);
    };

    const calculateAge = (dob: string) => {
        if (!dob) return 0;
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const handleEditChange = (key: keyof Patient, value: any) => {
        if (editFormData) {
            let updates: Partial<Patient> = { [key]: value };

            // Auto-calculate age if DOB changes
            if (key === 'birthDate') {
                updates.age = calculateAge(value);
            }

            // Reset city if state changes
            if (key === 'state') {
                updates.city = '';
            }

            setEditFormData({ ...editFormData, ...updates });
        }
    };

    const handleSaveEdit = async () => {
        if (editFormData) {
            // 1. Save to Storage
            await savePatient(editFormData);

            // 2. Update Local State (both visits and selectedPatient)
            const updatedVisits = visits.map(v => {
                if (v.uhid === editFormData.uhid) {
                    return {
                        ...v,
                        title: editFormData.title,
                        firstName: editFormData.firstName,
                        middleName: editFormData.middleName,
                        lastName: editFormData.lastName,
                        age: editFormData.age,
                        sex: editFormData.sex,
                        mobile: editFormData.mobile,
                        address: editFormData.address,
                        state: editFormData.state,
                        city: editFormData.city,
                        taluka: editFormData.taluka,
                        userType: editFormData.userType,
                        consultantName: editFormData.consultantName,
                        email: editFormData.email,
                        birthDate: editFormData.birthDate
                    };
                }
                return v;
            });
            setVisits(updatedVisits);
            setSelectedPatient(editFormData); // Update view

            // 3. Exit Edit Mode
            setIsEditing(false);
            setEditFormData(null);
        }
    };

    const isToday = selectedDate === new Date().toISOString().split('T')[0];

    const DetailItem = ({ label, value, className, isMono }: { label: string, value: string | number | undefined, className?: string, isMono?: boolean }) => (
        <div className={className}>
            <label className="text-xs text-text-muted uppercase block mb-1 font-semibold tracking-wider">{label}</label>
            <p className={cn("text-base text-text-primary", isMono && "font-mono text-primary font-medium")}>{value || '-'}</p>
        </div>
    );

    // Helper for dropdown options
    const getOptions = (arr: string[]) => arr.map(s => ({ value: s, label: s }));

    if (!masterData) return <div className="p-8 text-white">Loading Dashboard...</div>;

    return (
        <div className="space-y-6">
            {/* PATIENT FILTER SLIDER */}
            <div className="flex justify-center mb-8">
                <div className="bg-card/50 border border-border p-1.5 rounded-full flex gap-1 shadow-xl">
                    <button
                        onClick={() => setShowChecked(false)}
                        className={cn(
                            "flex items-center gap-2 px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300",
                            !showChecked 
                                ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                                : "text-text-muted hover:text-white"
                        )}
                    >
                        <Clock size={18} /> Unchecked Patients
                        <span className="ml-2 bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                            {filteredVisits.filter(v => !(v.prescriptionCount > 0 && bills.some(b => b.uhid === v.uhid && b.date === v.visitDate))).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setShowChecked(true)}
                        className={cn(
                            "flex items-center gap-2 px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300",
                            showChecked 
                                ? "bg-green-600 text-white shadow-lg shadow-green-600/20" 
                                : "text-text-muted hover:text-white"
                        )}
                    >
                        <Activity size={18} /> Checked Patients
                        <span className="ml-2 bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                            {filteredVisits.filter(v => v.prescriptionCount > 0 && bills.some(b => b.uhid === v.uhid && b.date === v.visitDate)).length}
                        </span>
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold text-white uppercase tracking-tight">
                        {showChecked ? "Checked Records" : (isToday ? "Today's Queue" : "Pending Records")}
                    </h1>
                    <p className="text-text-muted text-sm mt-1">
                        {showChecked ? "Patients who have received Prescription & Bill" : "Patients awaiting consultation or billing"}
                    </p>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="w-40">
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-primary/20"
                        />
                    </div>
                    <Button onClick={() => navigate('/new-patient')} className="flex items-center gap-2">
                        <UserIcon size={16} /> + New Patient
                    </Button>
                </div>
            </div>

            {displayVisits.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-20 text-center bg-card/20 border-dashed">
                    <div className="w-20 h-20 bg-background border border-border rounded-full flex items-center justify-center mb-6 text-text-muted opacity-30">
                        {showChecked ? <Activity size={40} /> : <UserIcon size={40} />}
                    </div>
                    <h3 className="text-xl font-heading font-bold text-white">No {showChecked ? "Checked" : "Unchecked"} Patients</h3>
                    <p className="text-text-muted mb-8 max-w-sm">
                        {showChecked 
                            ? "No patients have completed both prescription and billing for this date." 
                            : "All registered patients for this date have been processed."}
                    </p>
                    {!showChecked && isToday && (
                        <Button onClick={() => navigate('/new-patient')}>
                            Register New Patient
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayVisits.map((v) => {
                        const hasBill = bills.some(b => b.uhid === v.uhid && b.date === v.visitDate);
                        const isChecked = v.prescriptionCount > 0 && hasBill;
                        
                        // Construct a Patient-like object for handlers
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

                        return (
                            <div
                                key={`${v.uhid}-${v.visitCount}`}
                                onClick={() => handlePatientClick(patientLike)}
                                className={cn(
                                    "group p-6 rounded-2xl border transition-all cursor-pointer relative overflow-hidden",
                                    isChecked 
                                        ? "bg-green-600/5 border-green-500/20 hover:border-green-500/50 hover:bg-green-600/10" 
                                        : "bg-card border-border hover:border-primary/50 hover:bg-card/80 shadow-lg hover:shadow-primary/5"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-0 left-0 w-1.5 h-full transition-opacity",
                                    isChecked ? "bg-green-500" : "bg-primary opacity-30 group-hover:opacity-100"
                                )} />

                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-1.5">
                                        <span className={cn(
                                            "text-[10px] font-mono font-bold px-2 py-0.5 rounded w-fit",
                                            isChecked ? "bg-green-500/20 text-green-400" : "bg-primary/10 text-primary"
                                        )}>
                                            {v.uhid}
                                        </span>
                                        <span className="text-[10px] bg-background border border-border text-text-muted font-bold px-2 py-0.5 rounded w-fit">
                                            Visit #{v.visitCount}
                                        </span>
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm",
                                        v.userType === 'New' ? "bg-blue-600/20 text-blue-400" : "bg-purple-600/20 text-purple-400"
                                    )}>
                                        {v.userType}
                                    </span>
                                </div>

                                <h3 className="text-xl font-heading font-bold text-white mb-2 group-hover:text-primary transition-colors uppercase tracking-tight">
                                    {v.title} {v.firstName} {v.lastName}
                                </h3>

                                <div className="flex items-center text-xs text-text-muted mb-6 font-medium">
                                    <span className="bg-white/5 px-2 py-1 rounded">{v.age} Yrs</span>
                                    <span className="mx-2 opacity-30">|</span>
                                    <span className="bg-white/5 px-2 py-1 rounded">{v.sex}</span>
                                    <span className="mx-2 opacity-30">|</span>
                                    <span className="truncate">{v.mobile}</span>
                                </div>

                                <div className="pt-5 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center text-xs text-text-muted font-bold italic">
                                        <Stethoscope size={14} className="mr-2 text-primary" />
                                        <span className="truncate max-w-[140px] uppercase">{v.consultantName}</span>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        {v.prescriptionCount > 0 && (
                                            <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center border border-green-500/20" title="Prescription Saved">
                                                <Pill size={12} />
                                            </span>
                                        )}
                                        {hasBill && (
                                            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center border border-blue-500/20" title="Bill Generated">
                                                <FileText size={12} />
                                            </span>
                                        )}
                                        {isChecked && (
                                            <span className="flex items-center gap-1.5 text-[10px] font-black text-green-500 uppercase tracking-tighter bg-green-500/10 px-2 py-1 rounded-lg">
                                                <Activity size={12} /> Done
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Patient Details Modal */}
            {selectedPatient && (
                <Modal
                    isOpen={isDetailsModalOpen}
                    onClose={() => setDetailsModalOpen(false)}
                    title={isEditing ? "Edit Patient Details" : "Patient Details"}
                    size="2xl"
                >
                    <div className="flex flex-col h-full">
                        {/* Modal Tabs (View Mode Only) */}
                        {!isEditing && (
                            <div className="flex gap-4 border-b border-border mb-6">
                                <button
                                    onClick={() => setActiveTab('details')}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                                        activeTab === 'details' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                                    )}
                                >
                                    <UserIcon size={16} /> Basic Details
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                                        activeTab === 'history' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                                    )}
                                >
                                    <Clock size={16} /> Visit History
                                </button>
                                <button
                                    onClick={() => setActiveTab('digilocker')}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                                        activeTab === 'digilocker' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white"
                                    )}
                                >
                                    <FolderOpen size={16} /> Medical Records (Patient Digilocker)
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* --- DETAILS TAB --- */}
                            {activeTab === 'details' && !isEditing && (
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
                                            <DetailItem label="Email" value={selectedPatient.email} /> {/* Display Email */}
                                            <DetailItem label="Purpose of Visit" value={selectedPatient.purposeOfVisit} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- HISTORY TAB --- */}
                            {activeTab === 'history' && !isEditing && (
                                <div className="space-y-4 animate-in fade-in">
                                    {patientHistory.length === 0 ? (
                                        <div className="text-center py-12 text-text-muted">
                                            <Clock size={48} className="mx-auto mb-3 opacity-20" />
                                            <p>No visit history found.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {patientHistory.map((visit) => {
                                                const isExpanded = expandedVisitId === visit.visitCount;
                                                return (
                                                    <div key={visit.visitCount} className="bg-white/5 border border-border rounded-xl overflow-hidden transition-all">
                                                        {/* Card Header */}
                                                        <div
                                                            className="p-4 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors"
                                                            onClick={() => setExpandedVisitId(isExpanded ? null : visit.visitCount)}
                                                        >
                                                            <div className="flex gap-4 items-center">
                                                                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                                                                    #{visit.visitCount}
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-medium text-white">{formatDate(visit.date)}</h4>
                                                                    <p className="text-xs text-text-muted flex items-center gap-1">
                                                                        <Stethoscope size={12} /> {visit.consultant || 'N/A'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                {/* Badges */}
                                                                {visit.rx && <span className="text-[10px] px-2 py-1 bg-green-500/10 text-green-500 rounded flex items-center gap-1"><Pill size={10} /> Rx</span>}
                                                                {visit.bill && <span className="text-[10px] px-2 py-1 bg-blue-500/10 text-blue-500 rounded flex items-center gap-1"><FileText size={10} /> Bill</span>}
                                                                {isExpanded ? <ChevronUp size={18} className="text-text-muted" /> : <ChevronDown size={18} className="text-text-muted" />}
                                                            </div>
                                                        </div>

                                                        {/* Expandable Content */}
                                                        <AnimatePresence>
                                                            {isExpanded && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="overflow-hidden bg-background/50"
                                                                >
                                                                    <div className="p-4 border-t border-border space-y-4">
                                                                        {/* Clinical Data Section */}
                                                                        {visit.rx ? (
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                <div className="space-y-2">
                                                                                    <h5 className="text-xs font-bold text-primary uppercase">Complaints</h5>
                                                                                    <p className="text-sm text-text-muted">{visit.rx.data.complaint || 'No complaints recorded.'}</p>
                                                                                </div>
                                                                                <div className="space-y-2">
                                                                                    <h5 className="text-xs font-bold text-primary uppercase">Diagnosis</h5>
                                                                                    <p className="text-sm text-text-muted">{visit.rx.data.diagnosis || 'No diagnosis recorded.'}</p>
                                                                                </div>
                                                                                <div className="col-span-1 md:col-span-2">
                                                                                    <h5 className="text-xs font-bold text-primary uppercase mb-2">Prescribed Medicines</h5>
                                                                                    {visit.rx.data.prescriptions.length > 0 ? (
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                            {visit.rx.data.prescriptions.map((med, idx) => (
                                                                                                <span key={idx} className="text-xs bg-white/10 px-2 py-1 rounded border border-white/5">
                                                                                                    {med.medicineName} <span className="opacity-50">({med.dosage})</span>
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <p className="text-sm text-text-muted italic">No medicines prescribed.</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="p-3 border border-dashed border-border rounded text-center text-xs text-text-muted">No clinical data found for this visit.</div>
                                                                        )}

                                                                        {/* Billing Section */}
                                                                        {visit.bill && (
                                                                            <div className="mt-4 pt-4 border-t border-border">
                                                                                <h5 className="text-xs font-bold text-secondary uppercase mb-2 flex items-center gap-1">
                                                                                    <FileText size={12} /> Bill Summary
                                                                                </h5>
                                                                                <div className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
                                                                                    <div>
                                                                                        <p className="text-xs text-text-muted">Bill No: <span className="text-white font-mono">{visit.bill.billNo}</span></p>
                                                                                        <p className="text-xs text-text-muted mt-1">{visit.bill.items.length} Items</p>
                                                                                    </div>
                                                                                    <div className="text-right">
                                                                                        <div className="text-lg font-bold text-white flex items-center">
                                                                                            <IndianRupee size={14} className="mr-0.5" />
                                                                                            {visit.bill.total.toLocaleString()}
                                                                                        </div>
                                                                                        {visit.bill.paymentMode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary">{visit.bill.paymentMode}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- DIGILOCKER TAB --- */}
                            {activeTab === 'digilocker' && !isEditing && (
                                <div className="space-y-6 animate-in fade-in">
                                    {/* Drag & Drop / Upload Area */}
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={async (e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                const files = Array.from(e.dataTransfer.files);
                                                await handleUpload(files);
                                            }
                                        }}
                                        className={cn(
                                            "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 relative cursor-pointer flex flex-col items-center justify-center min-h-[160px]",
                                            isDragging
                                                ? "border-primary bg-primary/10 shadow-lg scale-[1.01]"
                                                : "border-white/10 hover:border-primary/50 bg-white/5 hover:bg-white/10"
                                        )}
                                    >
                                        <input
                                            type="file"
                                            id="digilocker-file-upload"
                                            multiple
                                            onChange={async (e) => {
                                                if (e.target.files && e.target.files.length > 0) {
                                                    const files = Array.from(e.target.files);
                                                    await handleUpload(files);
                                                }
                                            }}
                                            className="hidden"
                                        />
                                        <label htmlFor="digilocker-file-upload" className="cursor-pointer flex flex-col items-center gap-3 w-full">
                                            {isUploading ? (
                                                <Loader2 size={36} className="text-primary animate-spin" />
                                            ) : (
                                                <Upload size={36} className="text-primary hover:scale-110 transition-transform" />
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-white">
                                                    {isUploading ? "Uploading files..." : "Drag & drop files here or click to upload"}
                                                </p>
                                                <p className="text-xs text-text-muted mt-1">
                                                    Any file type or size is allowed
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Documents Table */}
                                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-text-muted">
                                                    <th className="px-4 py-3 text-center w-16">Sr No</th>
                                                    <th className="px-4 py-3">Default File Name</th>
                                                    <th className="px-4 py-3">File Name (Editable)</th>
                                                    <th className="px-4 py-3 text-right pr-6 w-44">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-sm">
                                                {documents.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-4 py-8 text-center text-text-muted italic">
                                                            No medical records uploaded yet for this patient.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    documents.map((doc, idx) => {
                                                        const isEditingName = editingDocId === doc.id;
                                                        return (
                                                            <tr key={doc.id} className="hover:bg-white/5 transition-colors">
                                                                <td className="px-4 py-3 text-center text-text-muted font-mono">{idx + 1}</td>
                                                                <td className="px-4 py-3 text-white truncate max-w-[200px]" title={doc.default_name}>
                                                                    {doc.default_name}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {isEditingName ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <Input
                                                                                value={editingDocName}
                                                                                onChange={(e) => setEditingDocName(e.target.value)}
                                                                                className="h-8 py-0 px-2 text-xs w-full bg-background border border-primary text-white"
                                                                                autoFocus
                                                                            />
                                                                            <button
                                                                                onClick={() => handleSaveDocName(doc.id)}
                                                                                className="p-1 rounded bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-all"
                                                                                title="Save Name"
                                                                            >
                                                                                <Check size={14} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setEditingDocId(null)}
                                                                                className="p-1 rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-all"
                                                                                title="Cancel"
                                                                            >
                                                                                <X size={14} />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2 group">
                                                                            <span className="text-text-primary font-medium">{doc.custom_name}</span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingDocId(doc.id);
                                                                                    setEditingDocName(doc.custom_name);
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-white hover:bg-white/10 rounded transition-all"
                                                                                title="Edit Name"
                                                                            >
                                                                                <Edit3 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-right pr-6">
                                                                    <div className="flex justify-end gap-2">
                                                                        <a
                                                                            href={getPatientDocumentViewUrl(doc.id)}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="px-3 py-1.5 text-xs font-bold rounded bg-primary/20 text-primary hover:bg-primary hover:text-white border border-primary/20 transition-all flex items-center gap-1.5"
                                                                        >
                                                                            <Eye size={12} /> View
                                                                        </a>
                                                                        <button
                                                                            onClick={() => handleDeleteDoc(doc.id)}
                                                                            className="px-3 py-1.5 text-xs font-bold rounded bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all flex items-center gap-1.5"
                                                                        >
                                                                            <Trash2 size={12} /> Delete
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- EDIT FORM (Replaces Tabs) --- */}
                            {isEditing && (
                                <div className="animate-in fade-in space-y-6">
                                    {/* Registration Section */}
                                    <div>
                                        <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                                            Registration Details
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <Input
                                                label="Date"
                                                type="date"
                                                value={editFormData?.date}
                                                onChange={(e) => handleEditChange('date', e.target.value)}
                                            />
                                            <Input
                                                label="UHID"
                                                value={editFormData?.uhid}
                                                readOnly
                                                className="bg-white/5 cursor-not-allowed text-text-muted"
                                            />
                                            <Select
                                                label="User Type"
                                                options={[{ value: 'New', label: 'New' }, { value: 'Old', label: 'Old' }]}
                                                value={editFormData?.userType}
                                                onChange={(e) => handleEditChange('userType', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Personal Information */}
                                    <div>
                                        <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                                            Personal Information
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="col-span-1">
                                                <Select
                                                    label="Title"
                                                    options={[{ value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Dr', label: 'Dr' }, { value: 'Baby', label: 'Baby' }]}
                                                    value={editFormData?.title}
                                                    onChange={(e) => handleEditChange('title', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <Input label="First Name" value={editFormData?.firstName} onChange={(e) => handleEditChange('firstName', e.target.value)} />
                                            </div>
                                            <div className="col-span-2">
                                                <Input label="Middle Name" value={editFormData?.middleName} onChange={(e) => handleEditChange('middleName', e.target.value)} />
                                            </div>
                                            <div className="col-span-2">
                                                <Input label="Last Name" value={editFormData?.lastName} onChange={(e) => handleEditChange('lastName', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                            <Input
                                                label="Date of Birth"
                                                type="date"
                                                value={editFormData?.birthDate}
                                                onChange={(e) => handleEditChange('birthDate', e.target.value)}
                                            />
                                            <Input
                                                label="Age"
                                                type="number"
                                                value={editFormData?.age}
                                                readOnly
                                                className="bg-white/5 cursor-not-allowed"
                                                placeholder="Auto-calc"
                                            />
                                            <Select
                                                label="Sex"
                                                options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]}
                                                value={editFormData?.sex}
                                                onChange={(e) => handleEditChange('sex', e.target.value)}
                                            />
                                            <Input
                                                label="Mobile No"
                                                value={editFormData?.mobile}
                                                onChange={(e) => handleEditChange('mobile', e.target.value)}
                                                maxLength={10}
                                            />
                                        </div>
                                    </div>

                                    {/* Contact & Visit Details */}
                                    <div>
                                        <h3 className="text-sm uppercase tracking-wider text-primary font-semibold mb-3 border-b border-border pb-2">
                                            Contact & Visit Details
                                        </h3>
                                        <div className="space-y-4">
                                            <Input label="Address" value={editFormData?.address} onChange={(e) => handleEditChange('address', e.target.value)} />

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <Select
                                                    label="State"
                                                    options={masterData ? Object.keys(masterData.statesAndCities).map(s => ({ value: s, label: s })) : []}
                                                    value={editFormData?.state}
                                                    onChange={(e) => handleEditChange('state', e.target.value)}
                                                />
                                                <Select
                                                    label="City"
                                                    options={masterData && editFormData?.state ? (masterData.statesAndCities[editFormData.state] || []).map(c => ({ value: c, label: c })) : []}
                                                    value={editFormData?.city}
                                                    onChange={(e) => handleEditChange('city', e.target.value)}
                                                />
                                                <Input
                                                    label="Taluka"
                                                    value={editFormData?.taluka}
                                                    onChange={(e) => handleEditChange('taluka', e.target.value)}
                                                    maxLength={6}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 bg-white/5 p-3 rounded-lg border border-border/30">
                                                <Select
                                                    label="Referred By"
                                                    options={masterData ? getOptions(masterData.referredBy) : []}
                                                    value={editFormData?.referredBy}
                                                    onChange={(e) => handleEditChange('referredBy', e.target.value)}
                                                />
                                                <Select
                                                    label="Payment By"
                                                    options={masterData ? getOptions(masterData.paymentBy) : []}
                                                    value={editFormData?.paymentBy}
                                                    onChange={(e) => handleEditChange('paymentBy', e.target.value)}
                                                />
                                                <Select
                                                    label="Consultant"
                                                    options={masterData ? getOptions(masterData.consultants) : []}
                                                    value={editFormData?.consultantName}
                                                    onChange={(e) => handleEditChange('consultantName', e.target.value)}
                                                />
                                                <Select
                                                    label="Purpose of Visit"
                                                    options={masterData ? getOptions(masterData.purposeOfVisit) : []}
                                                    value={editFormData?.purposeOfVisit}
                                                    onChange={(e) => handleEditChange('purposeOfVisit', e.target.value)}
                                                />
                                                <Select
                                                    label="ID Proof Type"
                                                    options={masterData && masterData.idProofs ? getOptions(masterData.idProofs) : [{ value: 'Aadhar Card', label: 'Aadhar Card' }]}
                                                    value={editFormData?.idProofType}
                                                    onChange={(e) => handleEditChange('idProofType', e.target.value)}
                                                />
                                                <Input
                                                    label="ID Number"
                                                    value={editFormData?.idProofNumber}
                                                    onChange={(e) => handleEditChange('idProofNumber', e.target.value)}
                                                />
                                                <Input
                                                    label="Email"
                                                    value={editFormData?.email}
                                                    onChange={(e) => handleEditChange('email', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-border mt-4">
                            {/* Left Side (Edit Toggle) */}
                            <div>
                                {!isEditing ? (
                                    <Button variant="secondary" onClick={handleStartEdit} className="text-secondary hover:text-white border-secondary/30">
                                        <Edit size={16} className="mr-2" /> Edit Details
                                    </Button>
                                ) : (
                                    <span className="text-xs text-yellow-500 font-bold animate-pulse">Editing Mode Active</span>
                                )}
                            </div>

                            {/* Right Side (Actions) */}
                            <div className="flex gap-3">
                                {!isEditing ? (
                                    <>
                                        <Button variant="secondary" onClick={() => setDetailsModalOpen(false)}>Close</Button>
                                        {user.role === UserRole.RECEPTIONIST ? (
                                            <Button onClick={() => {
                                                setDetailsModalOpen(false);
                                                navigate('/billing');
                                            }}>Create Bill</Button>
                                        ) : (
                                            <Button onClick={() => {
                                                setDetailsModalOpen(false);
                                                navigate('/prescribe');
                                            }}>Go to Prescribe</Button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Button variant="secondary" onClick={handleCancelEdit} className="text-danger hover:text-white">
                                            <X size={16} className="mr-2" /> Cancel
                                        </Button>
                                        <Button onClick={handleSaveEdit}>
                                            <Save size={16} className="mr-2" /> Save Changes
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
