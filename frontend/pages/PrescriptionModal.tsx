import React, { useState, useEffect, useRef } from 'react';
import { Modal, Input, Button, Select, cn, Card } from '../components/UI';
import { Patient, ClinicalData, PrescriptionItem, Medicine, PrescriptionRecord, MedicineType, Vitals, ClinicalPreferences, UserRole, DoctorPageSettings } from '../types';
import { getMedicines, savePatient, formatDate, getDoctorPreferences, getStoredAuth, getUsers, saveVisit, API_BASE_URL, saveMedicine, getDoctorPageSettings, saveDoctorPageSettings } from '../services/storage';
import { Plus, Trash2, Save, Printer, History, FileBadge, HeartHandshake, CheckSquare, Calendar, Eye, EyeOff, Edit3, MoreHorizontal, X as XIcon, MessageSquare, ArrowLeft } from 'lucide-react';
import { useMasterData } from '../MasterContext';
import { formatPrescriptionMessage, sendWhatsAppMessage } from '../services/whatsapp';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patient: Patient;
    viewOnlyRecord?: PrescriptionRecord;
}

const ordinals = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const CLINICAL_FIELDS = [
    { key: 'complaint', label: 'Complaints' },
    { key: 'history', label: 'Medical History' },
    { key: 'findings', label: 'Clinical Findings' },
    { key: 'investigation', label: 'Investigation' },
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'actionPlan', label: 'Action Plan' },
    { key: 'advice', label: 'Advice' },
    { key: 'instruction', label: 'Instruction' }
];

type DocumentType = 'none' | 'prescription' | 'notepad';

// --- HELPER COMPONENTS ---

interface VitalInputProps {
    label: string;
    unit?: string;
    value?: string;
    onChange: (val: string) => void;
    isViewOnly: boolean;
    readOnly?: boolean;
}

const VitalInput: React.FC<VitalInputProps> = ({ label, unit, value, onChange, isViewOnly, readOnly }) => (
    <div className="relative w-20 md:w-24">
        <label className="block text-[10px] uppercase text-text-muted font-bold mb-0.5">{label}</label>
        <div className="relative">
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    "w-full bg-background border border-border rounded px-2 py-1 text-sm text-white focus:border-primary focus:outline-none",
                    unit && "pr-8",
                    readOnly && "opacity-70 cursor-not-allowed bg-white/5"
                )}
                placeholder="-"
                readOnly={isViewOnly || readOnly}
            />
            {unit && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-text-muted pointer-events-none">{unit}</span>}
        </div>
    </div>
);

interface ClinicalInputProps {
    label: string;
    value?: string;
    onChange: (val: string) => void;
    placeholder?: string;
    isViewOnly: boolean;
    checked: boolean;
    onCheckChange: (checked: boolean) => void;
    suggestions?: string[];
}

const ClinicalInput: React.FC<ClinicalInputProps> = ({
    label, value, onChange, placeholder, isViewOnly, checked, onCheckChange, suggestions
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleSuggestionClick = (text: string) => {
        const currentVal = value || '';
        const newVal = currentVal ? `${currentVal}, ${text}` : text;
        onChange(newVal);
    };

    return (
        <div className={cn("flex-1 group mb-4 transition-opacity relative", !checked && "opacity-60")}>
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                    <div className="cursor-pointer" onClick={() => !isViewOnly && onCheckChange(!checked)}>
                        <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                            checked ? "bg-primary border-primary" : "bg-transparent border-text-muted"
                        )}>
                            {checked && <CheckSquare size={12} className="text-white" />}
                        </div>
                    </div>
                    <label
                        className={cn("text-xs font-medium uppercase tracking-wider select-none cursor-pointer", checked ? "text-primary" : "text-text-muted")}
                        onClick={() => !isViewOnly && onCheckChange(!checked)}
                    >
                        {label}
                    </label>

                    {/* Quick Pick Button */}
                    {!isViewOnly && suggestions && suggestions.length > 0 && checked && (
                        <button
                            type="button"
                            onClick={() => setShowSuggestions(!showSuggestions)}
                            className={cn(
                                "ml-2 p-1 rounded hover:bg-white/10 transition-colors",
                                showSuggestions ? "text-primary bg-primary/10" : "text-text-muted"
                            )}
                            title="Quick Suggestions"
                        >
                            <MoreHorizontal size={14} />
                        </button>
                    )}
                </div>
                {!checked && <span className="text-[10px] text-text-muted italic flex items-center gap-1"><EyeOff size={10} /> Hidden in Print</span>}
            </div>

            {/* Suggestions Panel - Inline Expansion */}
            {showSuggestions && suggestions && (
                <div className="mb-2 p-2 bg-card border border-border rounded-lg animate-in fade-in slide-in-from-top-1">
                    <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/5">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Select to append</span>
                        <button onClick={() => setShowSuggestions(false)}><XIcon size={12} className="text-text-muted hover:text-white" /></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => handleSuggestionClick(s)}
                                className="text-xs bg-white/5 hover:bg-primary/20 hover:text-primary text-text-primary px-2 py-1 rounded border border-white/5 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <textarea
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary h-20 focus:border-primary focus:ring-1 focus:ring-primary transition-colors text-sm resize-none custom-scrollbar"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                readOnly={isViewOnly}
            />
        </div>
    );
};

export const PrescriptionModal: React.FC<Props> = ({ isOpen, onClose, patient, viewOnlyRecord }) => {
    const { masterData } = useMasterData();
    const [medicines, setMedicines] = useState<Medicine[]>([]);

    // Preferences and Consultant Info
    const [clinicalPrefs, setClinicalPrefs] = useState<ClinicalPreferences | null>(null);
    const [consultantDesignation, setConsultantDesignation] = useState<string>('');

    // Document Preview State
    const [showPreview, setShowPreview] = useState(!!viewOnlyRecord);
    const [previewType, setPreviewType] = useState<DocumentType>(viewOnlyRecord ? 'prescription' : 'none');
    const [previewRecord, setPreviewRecord] = useState<PrescriptionRecord | null>(viewOnlyRecord || null);

    // Notepad / Certificate State
    const [notepadOpen, setNotepadOpen] = useState(false);
    const [notepadTitle, setNotepadTitle] = useState('');
    const [notepadContent, setNotepadContent] = useState('');
    const [hasSavedLocally, setHasSavedLocally] = useState(false);

    // Page Settings for Print
    const [pageSettings, setPageSettings] = useState<DoctorPageSettings | null>(null);
    const [printZoom, setPrintZoom] = useState(1.0);
    const printAreaRef = useRef<HTMLDivElement>(null);

    // Initialize with robust defaults
    const defaultPrintSettings = CLINICAL_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: true }), {} as { [key: string]: boolean });

    const defaultClinicalData: ClinicalData = {
        complaint: '',
        history: '',
        findings: '',
        investigation: '',
        diagnosis: '',
        actionPlan: '',
        treatment: '',
        advice: '',
        instruction: '',
        previousIntervention: '',
        riskFactors: '',
        prescriptions: [],
        vitals: { bp: '', temp: '', spo2: '', pulse: '', height: '', weight: '', bmi: '' },
        printSettings: defaultPrintSettings
    };

    const [clinicalData, setClinicalData] = useState<ClinicalData>(defaultClinicalData);

    const isViewOnly = !!viewOnlyRecord;


    const formatPrintDate = (isoDate: string) => {
        if (!isoDate) return '';
        const [y, m, d] = isoDate.split('-');
        return `${d}/${m}/${y.slice(2)}`;
    };

    // Medicine Input State
    const [currentMed, setCurrentMed] = useState<{
        id: string;
        dosage: string;
        instruction: string;
        days: number | '';
        type: MedicineType;
    }>({ id: '', dosage: '1-0-1', instruction: 'After Food', days: '', type: MedicineType.TAB });

    const [medSearch, setMedSearch] = useState('');
    const [medFilterType, setMedFilterType] = useState<string>('ALL');
    const [showSuggestions, setShowSuggestions] = useState(false);

    // New Medicine Prompt State
    const [showNewMedPrompt, setShowNewMedPrompt] = useState(false);
    const [pendingMedName, setPendingMedName] = useState('');

    // History Import State
    const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
    const [selectedHistoryVisits, setSelectedHistoryVisits] = useState<number[]>([]);
    const [hoveredVisit, setHoveredVisit] = useState<PrescriptionRecord | null>(null);

    const enterPressRef = React.useRef<number>(0);
    const handleSaveAndPrintRef = React.useRef<() => void>(() => {});

    // Follow-up state
    const [followUpDays, setFollowUpDays] = useState<string>('');
    const [followUpDate, setFollowUpDate] = useState<string>(''); // ISO YYYY-MM-DD

    // Helper: ISO date -> DD/MM/YY for display
    function isoToDisplay(iso: string) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y.slice(2)}`;
    }

    // Helper: add N days to a base ISO date, return ISO date
    function addDays(baseIso: string, days: number) {
        if (!baseIso || isNaN(days) || days <= 0) return '';
        const d = new Date(baseIso);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    // Helper: diff in days between two ISO dates
    function diffDays(dateIso: string, baseIso: string) {
        const a = new Date(dateIso).getTime();
        const b = new Date(baseIso).getTime();
        return Math.round((a - b) / 86400000);
    }

    // For the print record: use the saved nextVisitDate from the history record (if viewing),
    // or the live followUpDate the user just typed (if editing current visit)
    const effectiveNextVisitDate = previewRecord
        ? (previewRecord.data.nextVisitDate || '')
        : (followUpDate || '');

    const recordToPrint = previewRecord
        ? { ...previewRecord, data: { ...previewRecord.data, nextVisitDate: effectiveNextVisitDate } }
        : {
            id: 'current',
            date: patient.date,
            visitCount: patient.visitCount || 1,
            data: {
                ...clinicalData,
                nextVisitDate: effectiveNextVisitDate
            }
        };

    const activeDate = formatDate(recordToPrint.date);

    useEffect(() => {
        const initData = async () => {
            const meds = await getMedicines();
            setMedicines(meds);

            const allUsers = await getUsers();
            const consultantUser = allUsers.find(u => u.name === patient.consultantName);
            if (consultantUser) {
                setConsultantDesignation(consultantUser.designation || '');
            }

            const currentUser = getStoredAuth();
            let targetUserId = '';

            if (currentUser) {
                if (currentUser.role === UserRole.DOCTOR) {
                    targetUserId = currentUser.id;
                } else if (consultantUser) {
                    targetUserId = consultantUser.id;
                }
            }
            if (masterData) {
                let data: any = {};
                try {
                    const response = await fetch(`${API_BASE_URL}/master/prefs/${targetUserId}`);
                    if (response.ok) {
                        data = await response.json();
                    }
                } catch (e) {
                    console.error("Failed to fetch clinical prefs");
                }

                const mergedPrefs: ClinicalPreferences = {
                    dosages: data.dosages || masterData.dosages || [],
                    instructions: data.instructions || masterData.instructions || [],
                    clinicalNotes: data.clinicalNotes || masterData.clinicalNotes || {},
                    defaultFollowUpDays: data.defaultFollowUpDays ?? 10
                };
                setClinicalPrefs(mergedPrefs);

                if (targetUserId) {
                    const pgSettings = await getDoctorPageSettings(targetUserId);
                    setPageSettings(pgSettings);
                }
            }
        };

        if (isOpen) {
            initData();
        }

        if (viewOnlyRecord) {
            setClinicalData({
                ...defaultClinicalData,
                ...viewOnlyRecord.data,
                vitals: viewOnlyRecord.data.vitals || defaultClinicalData.vitals,
                printSettings: { ...defaultPrintSettings, ...(viewOnlyRecord.data.printSettings || {}) }
            });
            if (viewOnlyRecord.data.nextVisitDate) {
                setFollowUpDate(viewOnlyRecord.data.nextVisitDate);
                setFollowUpDays(String(diffDays(viewOnlyRecord.data.nextVisitDate, patient.date)));
            } else {
                setFollowUpDate(''); setFollowUpDays('');
            }
            setPreviewRecord(viewOnlyRecord);
            if (isOpen) {
                setShowPreview(true);
                setPreviewType('prescription');
            }
        } else {
            const currentVisitCount = patient.visitCount || 1;
            const currentVisitRecord = patient.prescriptionHistory?.find(r => r.visitCount === currentVisitCount);

            if (currentVisitRecord) {
                setClinicalData({
                    ...defaultClinicalData,
                    ...currentVisitRecord.data,
                    vitals: currentVisitRecord.data.vitals || defaultClinicalData.vitals,
                    printSettings: { ...defaultPrintSettings, ...(currentVisitRecord.data.printSettings || {}) }
                });
                // Restore saved follow-up date if present
                if (currentVisitRecord.data.nextVisitDate) {
                    setFollowUpDate(currentVisitRecord.data.nextVisitDate);
                    setFollowUpDays(String(diffDays(currentVisitRecord.data.nextVisitDate, patient.date)));
                } else {
                    setFollowUpDate(''); setFollowUpDays('');
                }
            } else {
                const lastHistory = patient.prescriptionHistory && patient.prescriptionHistory.length > 0
                    ? patient.prescriptionHistory[patient.prescriptionHistory.length - 1]
                    : null;

                const isStaleData = lastHistory &&
                    JSON.stringify(lastHistory.data) === JSON.stringify(patient.clinicalData) &&
                    currentVisitCount > (lastHistory.visitCount || 0);

                if (patient.clinicalData && !isStaleData) {
                    setClinicalData({
                        ...defaultClinicalData,
                        ...patient.clinicalData,
                        vitals: patient.clinicalData.vitals || defaultClinicalData.vitals,
                        printSettings: { ...defaultPrintSettings, ...(patient.clinicalData.printSettings || {}) }
                    });
                    if (patient.clinicalData.nextVisitDate) {
                        setFollowUpDate(patient.clinicalData.nextVisitDate);
                        setFollowUpDays(String(diffDays(patient.clinicalData.nextVisitDate, patient.date)));
                    } else {
                        setFollowUpDate(''); setFollowUpDays('');
                    }
                } else {
                    setClinicalData(defaultClinicalData);
                    setFollowUpDate(''); setFollowUpDays('');
                }
            }

            if (isOpen) {
                setShowPreview(false);
                setPreviewType('none');
            }
        }
    }, [patient, isOpen, viewOnlyRecord]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showPreview) {
                    setShowPreview(false);
                    if (viewOnlyRecord) onClose();
                } else if (showNewMedPrompt) {
                    setShowNewMedPrompt(false);
                    setPendingMedName('');
                } else if (notepadOpen) {
                    setNotepadOpen(false);
                }
            } else if (e.key === 'Enter') {
                if (isOpen && !viewOnlyRecord && !showPreview && !notepadOpen && !showNewMedPrompt) {
                     const target = e.target as HTMLElement;
                     if (target && (target.tagName.toLowerCase() === 'textarea' || target.tagName.toLowerCase() === 'button')) return;

                     const now = Date.now();
                     if (now - enterPressRef.current < 500) {
                         handleSaveAndPrintRef.current();
                         enterPressRef.current = 0;
                     } else {
                         enterPressRef.current = now;
                     }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPreview, notepadOpen, showNewMedPrompt, viewOnlyRecord, hasSavedLocally, onClose, isOpen]);

    // --- Auto-scale print to fit one page ---
    useEffect(() => {
        if (!showPreview || previewType !== 'prescription') {
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
                // Clamp zoom floor at 0.45 (very dense content)
                const zoom = Math.max(0.45, usable / contentH);
                setPrintZoom(parseFloat(zoom.toFixed(3)));
            } else {
                setPrintZoom(1.0);
            }
        }, 120);
        return () => clearTimeout(id);
    }, [showPreview, previewType, clinicalData, pageSettings]);

    const filteredMedicines = medicines.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(medSearch.toLowerCase()) ||
            m.code.toLowerCase().includes(medSearch.toLowerCase());
        const matchesType = medFilterType === 'ALL' || m.type === medFilterType;
        return matchesSearch && matchesType;
    });

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMedSearch(e.target.value);
        setShowSuggestions(true);
        if (currentMed.id) setCurrentMed(prev => ({ ...prev, id: '' }));
    };

    const selectMedicine = (med: Medicine) => {
        setCurrentMed(prev => ({ ...prev, id: med.id, type: med.type }));
        setMedSearch(med.name);
        setShowSuggestions(false);
    };

    const addPrescriptionItem = (name: string, type: MedicineType) => {
        const newItem: PrescriptionItem = {
            medicineName: name,
            type: type,
            dosage: currentMed.dosage,
            instruction: currentMed.instruction,
            days: Number(currentMed.days)
        };

        setClinicalData(prev => ({
            ...prev,
            prescriptions: [...prev.prescriptions, newItem]
        }));

        // Reset inputs
        setCurrentMed(prev => ({ ...prev, id: '', days: '', type: MedicineType.TAB }));
        setMedSearch('');
    };

    const handleAddMedicine = async () => {
        if (isViewOnly) return;
        if (currentMed.days === '' || currentMed.days <= 0) {
            alert("Please enter a valid number of days");
            return;
        }

        if (currentMed.id) {
            // Existing Medicine - Add directly
            const medRef = medicines.find(m => m.id === currentMed.id);
            if (!medRef) return;

            addPrescriptionItem(medRef.name, medRef.type);
        } else if (medSearch && medSearch.trim().length > 0) {
            // New Medicine Logic
            const newName = medSearch.trim();
            const existing = medicines.find(m => m.name.toLowerCase() === newName.toLowerCase());

            if (existing) {
                // It actually exists (case insensitive match)
                addPrescriptionItem(existing.name, existing.type);
            } else {
                // TRULY NEW - Prompt User for Type
                setPendingMedName(newName);
                setShowNewMedPrompt(true);
            }
        }
    };

    const confirmNewMedicine = async (selectedType: MedicineType) => {
        // Create new medicine
        const newMed: Medicine = {
            id: Math.random().toString(36).substr(2, 9),
            name: pendingMedName,
            type: selectedType,
            code: pendingMedName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 99) // Generate a simple code
        };

        try {
            await saveMedicine(newMed);
            setMedicines(prev => [...prev, newMed]);
            addPrescriptionItem(newMed.name, newMed.type);
            setShowNewMedPrompt(false);
            setPendingMedName('');
        } catch (error) {
            console.error("Failed to save new medicine", error);
            alert("Failed to save new medicine to database. Please try again.");
        }
    };

    const removeMedicine = (index: number) => {
        if (isViewOnly) return;
        setClinicalData(prev => ({
            ...prev,
            prescriptions: prev.prescriptions.filter((_, i) => i !== index)
        }));
    };

    const handleAddHistoryMedicines = () => {
        const medsToAdd: PrescriptionItem[] = [];
        selectedHistoryVisits.forEach(vc => {
            const visit = patient.prescriptionHistory?.find(r => r.visitCount === vc);
            if (visit && visit.data.prescriptions) {
                visit.data.prescriptions.forEach(med => {
                    medsToAdd.push({ ...med });
                });
            }
        });
        
        if (medsToAdd.length > 0) {
            setClinicalData(prev => ({
                ...prev,
                prescriptions: [...prev.prescriptions, ...medsToAdd]
            }));
        }
        
        setSelectedHistoryVisits([]);
        setShowHistoryDropdown(false);
    };

    const handleVitalChange = (key: keyof Vitals, val: string) => {
        setClinicalData(prev => {
            const newVitals = { ...prev.vitals, [key]: val };
            if (key === 'height' || key === 'weight') {
                const h = parseFloat(key === 'height' ? val : newVitals.height || '0');
                const w = parseFloat(key === 'weight' ? val : newVitals.weight || '0');
                if (h > 0 && w > 0) {
                    const hM = h / 100;
                    const bmi = w / (hM * hM);
                    newVitals.bmi = bmi.toFixed(1);
                } else if (!newVitals.height && !newVitals.weight) {
                    newVitals.bmi = '';
                }
            }
            return { ...prev, vitals: newVitals };
        });
    };

    const togglePrintSetting = (key: string, checked: boolean) => {
        setClinicalData(prev => ({
            ...prev,
            printSettings: { ...prev.printSettings, [key]: checked }
        }));
    };

    const handleSaveAndPrint = async () => {
        if (isViewOnly) return;
        // Compute effective follow-up date: user-entered OR default from prefs, based on patient.date
        const effectiveFollowUpDate = followUpDate ||
            addDays(patient.date, clinicalPrefs?.defaultFollowUpDays ?? 10);

        const clinicalDataToSave: ClinicalData = { ...clinicalData, nextVisitDate: effectiveFollowUpDate };
        setClinicalData(clinicalDataToSave);

        const currentVisit = patient.visitCount || 1;
        let history = [...(patient.prescriptionHistory || [])];
        const existingIndex = history.findIndex(r => r.visitCount === currentVisit);
        const recordData: PrescriptionRecord = {
            id: existingIndex >= 0 ? history[existingIndex].id : Math.random().toString(),
            date: existingIndex >= 0 ? history[existingIndex].date : patient.date,
            visitCount: currentVisit,
            data: clinicalDataToSave
        };
        if (existingIndex >= 0) {
            history[existingIndex] = recordData;
        } else {
            history.push(recordData);
        }
        const updatedPatient: Patient = {
            ...patient,
            clinicalData: clinicalDataToSave,
            prescriptionHistory: history
        };
        try {
            await Promise.all([
                savePatient(updatedPatient),
                saveVisit(patient.uhid, recordData.date, recordData.visitCount, clinicalDataToSave)
            ]);
            setHasSavedLocally(true);
            setPreviewRecord(null);
            setPreviewType('prescription');
            setShowPreview(true);
        } catch (err: any) {
            alert(err.message || "Failed to save visit data");
        }
    };

    handleSaveAndPrintRef.current = handleSaveAndPrint;

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
                doctor_id: patient.consultantName || '',
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

    const handleWhatsAppPrescription = () => {
        const record = recordToPrint;
        if (!record || !patient) return;

        const medicineList = record.data.prescriptions
            .map(m => `• ${m.type}. ${m.medicineName} (${m.dosage}) - ${m.days} Days${m.instruction ? `\n   Instruction: ${m.instruction}` : ''}`)
            .join('\n\n');

        const msg = formatPrescriptionMessage({
            patientTitle: patient.title,
            patientName: `${patient.firstName} ${patient.lastName}`,
            clinicName: masterData?.clinicName || 'Clinic',
            uhid: patient.uhid,
            age: patient.age,
            sex: patient.sex,
            mobile: patient.mobile,
            address: patient.address,
            doctorName: patient.consultantName || 'Doctor',
            doctorDesignation: consultantDesignation || 'Consultant',
            visitNo: ordinals(record.visitCount) + " Visit",
            medicineList: medicineList || 'Consultation only'
        });

        sendWhatsAppMessage(patient.mobile, msg);
    };

    const handleOpenCertificate = () => {
        const template = `This is to certify that ${patient.title} ${patient.firstName} ${patient.lastName}, ${patient.age}/${patient.sex}.
He / She is suffering from ${clinicalData.diagnosis || ''}
He / She was under my OPD care from
He / She is advised leave from  to
He / She is fit to resume his / her duties with effect from `;
        setNotepadTitle('Medical Certificate');
        setNotepadContent(template);
        setNotepadOpen(true);
    };

    const handleOpenThanksLetter = () => {
        const vitalsStr = `BP: ${clinicalData.vitals?.bp || ''} Pulse: ${clinicalData.vitals?.pulse || ''} `;
        const template = `To,
    Dear Sir,
        Thanks for referring ${patient.title} ${patient.firstName} ${patient.lastName}, ${patient.age}/${patient.sex}
Who presented with ${clinicalData.complaint || ''}
His / Her examination revealed:
${vitalsStr}
${clinicalData.findings || ''}
I have put him / her on treatment as per prescription.
Patient has been called for followup on ${clinicalData.nextVisitDate ? formatDate(clinicalData.nextVisitDate) : ''} `;
        setNotepadTitle('Referral / Thank You Letter');
        setNotepadContent(template);
        setNotepadOpen(true);
    };

    const handleOpenPrescription = () => {
        setPreviewRecord(null);
        setPreviewType('prescription');
        setShowPreview(true);
    };

    const ordinals = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    if (!clinicalPrefs) return null;

    return (
        <>
            {/* Hidden div to trap Escape key from closing the parent modal when inner views are active */}
            {(showPreview || notepadOpen || showNewMedPrompt) && (
                <div className="modal-backdrop hidden" aria-hidden="true"></div>
            )}

            {/* Main Editing Modal */}
            {!viewOnlyRecord && (
                <Modal isOpen={isOpen} onClose={onClose} title="Doctor Console" size="full">
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Header Info & Vitals */}
                        <div className="flex flex-col gap-4 bg-card p-4 rounded-xl border border-border mb-4 shrink-0 shadow-lg">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-xl text-white">{patient.title} {patient.firstName} {patient.middleName ? patient.middleName + ' ' : ''}{patient.lastName}</h3>
                                    <div className="text-sm text-text-muted flex items-center gap-2 mt-1">
                                        <span className="bg-white/5 px-2 py-0.5 rounded">{patient.age}Y / {patient.sex}</span>
                                        <span className="font-mono text-primary font-semibold">{patient.uhid}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" size="sm" variant="secondary" onClick={handleOpenCertificate} className="flex-1 sm:flex-none py-2"><FileBadge size={16} className="mr-2" /> Create Medical Certificate</Button>
                                    <Button type="button" size="sm" variant="secondary" onClick={handleOpenThanksLetter} className="flex-1 sm:flex-none py-2"><HeartHandshake size={16} className="mr-2" />Create Thanks Letter</Button>
                                    <Button type="button" size="sm" onClick={handleWhatsAppPrescription} className="flex-1 sm:flex-none py-2 bg-green-600 hover:bg-green-700 text-white border-none"><MessageSquare size={16} className="mr-2" /> WhatsApp</Button>
                                    <Button type="button" onClick={handleSaveAndPrint} className="flex-1 sm:flex-none py-2"><Printer size={16} className="mr-2" /> Save & Print</Button>
                                </div>
                            </div>

                            <div className="h-px bg-border w-full"></div>

                            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                                <VitalInput label="BP" unit="mmHg" value={clinicalData.vitals?.bp} onChange={(val) => handleVitalChange('bp', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="Pulse" unit="bpm" value={clinicalData.vitals?.pulse} onChange={(val) => handleVitalChange('pulse', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="SpO2" unit="%" value={clinicalData.vitals?.spo2} onChange={(val) => handleVitalChange('spo2', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="Temp" unit="°F" value={clinicalData.vitals?.temp} onChange={(val) => handleVitalChange('temp', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="Height" unit="cm" value={clinicalData.vitals?.height} onChange={(val) => handleVitalChange('height', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="Weight" unit="kg" value={clinicalData.vitals?.weight} onChange={(val) => handleVitalChange('weight', val)} isViewOnly={isViewOnly} />
                                <VitalInput label="BMI" value={clinicalData.vitals?.bmi} onChange={() => { }} isViewOnly={isViewOnly} readOnly={true} />
                            </div>
                        </div>

                        {/* New Medicine Type Selection Modal (Overlay) */}
                        {showNewMedPrompt && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                <div className="bg-card border border-primary p-6 rounded-xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
                                    <h3 className="text-lg font-bold text-white mb-2">New Medicine Detected</h3>
                                    <p className="text-sm text-text-muted mb-4">
                                        Adding <span className="text-primary font-bold">"{pendingMedName}"</span> to database.<br />
                                        Please select its type:
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 mb-4 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                                        {(masterData?.medicineTypes || []).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => confirmNewMedicine(t)}
                                                className="px-3 py-2 text-xs font-bold uppercase rounded border border-white/10 hover:bg-primary hover:text-white hover:border-primary transition-all bg-background text-text-muted"
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex justify-end">
                                        <Button variant="secondary" onClick={() => { setShowNewMedPrompt(false); setPendingMedName(''); }} size="sm">
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Main Grid Content */}
                        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-10 gap-6 min-h-0 overflow-y-auto lg:overflow-hidden custom-scrollbar lg:pr-2">
                            {/* Visits History Column */}
                            <div className="lg:col-span-2 flex flex-col gap-3 lg:border-r lg:border-border/50 lg:pr-4">
                                <div className="flex items-center gap-2 text-primary font-bold border-b border-border pb-2 mb-1 sticky top-0 bg-card z-10">
                                    <History size={18} /><span>Past Visits</span>
                                </div>
                                <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto no-scrollbar lg:custom-scrollbar pb-2 lg:pb-0">
                                    {(!patient.prescriptionHistory || patient.prescriptionHistory.length === 0) ? (
                                        <div className="text-center py-6 text-text-muted text-xs italic w-full">No history found.</div>
                                    ) : (
                                        [...patient.prescriptionHistory].reverse().map((record) => (
                                            <div key={record.id} className="min-w-[160px] lg:min-w-0 bg-background border border-border rounded-xl p-3 flex flex-col gap-3 group hover:border-primary/50 transition-all shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-white text-sm">Visit #{record.visitCount}</span>
                                                    <span className="text-[10px] text-text-muted">{formatDate(record.date)}</span>
                                                </div>
                                                <Button size="sm" variant="secondary" className="w-full text-xs py-1.5" onClick={() => { setPreviewRecord(record); setPreviewType('prescription'); setShowPreview(true); }}>
                                                    <Printer size={12} className="mr-2" /> View/Print
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Clinical Notes Column */}
                            <div className="lg:col-span-3 flex flex-col gap-3 lg:border-r lg:border-border/50 lg:pr-4 h-full overflow-hidden">
                                <div className="flex items-center gap-2 text-primary font-bold border-b border-border pb-2 mb-1 bg-card">
                                    <CheckSquare size={18} /><span>Clinical Notes</span>
                                </div>
                                <div className="space-y-1 lg:overflow-y-auto lg:custom-scrollbar flex-1 pr-1 h-full">
                                    {CLINICAL_FIELDS.map((field) => (
                                        <ClinicalInput
                                            key={field.key}
                                            label={field.label}
                                            value={clinicalData[field.key as keyof ClinicalData] as string}
                                            onChange={(v) => setClinicalData(p => ({ ...p, [field.key]: v }))}
                                            isViewOnly={isViewOnly}
                                            checked={clinicalData.printSettings ? clinicalData.printSettings[field.key] !== false : true}
                                            onCheckChange={(checked) => togglePrintSetting(field.key, checked)}
                                            suggestions={clinicalPrefs.clinicalNotes[field.key] || []}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Prescription column */}
                            <div className="lg:col-span-5 flex flex-col h-full min-h-[400px] lg:min-h-0">
                                <div className="flex justify-between items-center border-b border-border pb-2 mb-3 relative">
                                    <div className="flex items-center gap-2 text-primary font-bold"><Plus size={18} /><span>Prescription</span></div>
                                    
                                    <div className="flex items-center gap-2">
                                        {/* History Import Dropdown */}
                                        {!isViewOnly && patient.prescriptionHistory && patient.prescriptionHistory.length > 0 && (
                                            <>
                                                <div className="relative">
                                                    <Button 
                                                        type="button" 
                                                        size="sm" 
                                                        variant="secondary" 
                                                        onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                                                        className="text-xs"
                                                    >
                                                        <History size={14} className="mr-1" /> Previous Visits
                                                    </Button>
                                                    
                                                    {showHistoryDropdown && (
                                                        <div className="absolute top-full right-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 p-2">
                                                            <div className="max-h-60 overflow-y-auto custom-scrollbar relative">
                                                                {patient.prescriptionHistory
                                                                    .filter(r => r.data.prescriptions && r.data.prescriptions.length > 0 && r.visitCount !== (viewOnlyRecord?.visitCount || patient.visitCount || 1))
                                                                    .map(visit => (
                                                                    <div 
                                                                        key={visit.id} 
                                                                        className="group relative flex items-center gap-2 p-2 hover:bg-white/5 rounded transition-colors"
                                                                        onMouseEnter={() => setHoveredVisit(visit)}
                                                                        onMouseLeave={() => setHoveredVisit(null)}
                                                                    >
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={selectedHistoryVisits.includes(visit.visitCount)}
                                                                            onChange={(e) => {
                                                                                if(e.target.checked) setSelectedHistoryVisits(prev => [...prev, visit.visitCount]);
                                                                                else setSelectedHistoryVisits(prev => prev.filter(v => v !== visit.visitCount));
                                                                            }}
                                                                            className="w-3.5 h-3.5 rounded border-border"
                                                                        />
                                                                        <span className="text-sm text-white">Visit #{visit.visitCount} - {formatDate(visit.date)}</span>
                                                                    </div>
                                                                ))}
                                                                {patient.prescriptionHistory.filter(r => r.data.prescriptions && r.data.prescriptions.length > 0 && r.visitCount !== (viewOnlyRecord?.visitCount || patient.visitCount || 1)).length === 0 && (
                                                                    <div className="text-xs text-text-muted p-2 text-center italic">No previous prescriptions found.</div>
                                                                )}
                                                            </div>
                                                            
                                                            {/* Hover Table Rendered Outside Overflow */}
                                                            {hoveredVisit && (
                                                                <div className="absolute right-full top-0 mr-2 w-80 bg-black/95 backdrop-blur border border-primary/50 rounded-lg shadow-2xl z-[60] p-3 pointer-events-none">
                                                                    <h4 className="text-xs text-primary font-bold mb-2">Visit #{hoveredVisit.visitCount} Medicines</h4>
                                                                    <table className="w-full text-left text-xs">
                                                                        <thead className="text-text-muted border-b border-white/10">
                                                                            <tr>
                                                                                <th className="py-1">SrNo</th>
                                                                                <th className="py-1">Medicine</th>
                                                                                <th className="py-1">Dosage</th>
                                                                                <th className="py-1">Days</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-white/5">
                                                                            {hoveredVisit.data.prescriptions.map((med, idx) => (
                                                                                <tr key={idx} className="text-white/90">
                                                                                    <td className="py-1 text-text-muted">{idx+1}</td>
                                                                                    <td className="py-1 font-medium">{med.medicineName}</td>
                                                                                    <td className="py-1">{med.dosage}</td>
                                                                                    <td className="py-1">{med.days}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <Button 
                                                    type="button" 
                                                    size="sm" 
                                                    className="text-xs bg-primary hover:bg-primary-hover text-white"
                                                    disabled={selectedHistoryVisits.length === 0}
                                                    onClick={handleAddHistoryMedicines}
                                                >
                                                    <Plus size={14} className="mr-1" /> Add Visit
                                                </Button>
                                            </>
                                        )}
                                        
                                        <Button type="button" size="sm" variant="secondary" onClick={handleOpenPrescription} className="text-xs"><Printer size={14} className="mr-2" /> Print Preview</Button>
                                    </div>
                                </div>

                                <Card className="bg-background/40 p-3 mb-4 border-primary/20">
                                    <div className="flex flex-col gap-3">
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                            <div className="md:col-span-4 relative">
                                                <Input placeholder="Search Medicine..." value={medSearch} onChange={handleSearchChange} className="bg-card h-10 border-border" autoComplete="off" />
                                                {showSuggestions && medSearch && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-card border border-border rounded-xl shadow-2xl z-50">
                                                        {filteredMedicines.map(m => (
                                                            <div key={m.id} className="px-4 py-3 hover:bg-primary/10 cursor-pointer text-sm flex justify-between border-b border-white/5 last:border-0" onClick={() => selectMedicine(m)}>
                                                                <span className="font-medium text-white">{m.name}</span>
                                                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase">{m.type}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:col-span-2">
                                                <Select
                                                    options={(masterData?.medicineTypes || []).map(t => ({ value: t, label: t }))}
                                                    value={currentMed.type}
                                                    onChange={(e) => setCurrentMed({ ...currentMed, type: e.target.value })}
                                                    className="h-10"
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <Select options={clinicalPrefs.dosages} value={currentMed.dosage} onChange={(e) => setCurrentMed({ ...currentMed, dosage: e.target.value })} className="h-10" />
                                            </div>
                                            <div className="md:col-span-3 flex gap-2">
                                                <Input type="number" placeholder="Days" value={currentMed.days} onChange={(e) => setCurrentMed({ ...currentMed, days: e.target.value as any })} className="h-10 text-center" />
                                                <Button type="button" size="sm" onClick={handleAddMedicine} disabled={!currentMed.id && !medSearch} className="h-10 px-6 shrink-0"><Plus size={20} /></Button>
                                            </div>
                                        </div>
                                        <div>
                                            <Select options={clinicalPrefs.instructions} value={currentMed.instruction} onChange={(e) => setCurrentMed({ ...currentMed, instruction: e.target.value })} className="h-10" />
                                        </div>
                                    </div>
                                </Card>

                                <div className="flex-1 overflow-auto border border-border rounded-xl bg-card/20 min-h-[200px]">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white/5 text-text-muted uppercase text-[10px] font-bold tracking-wider sticky top-0">
                                            <tr>
                                                <th className="px-3 py-3 w-12 text-center">SR No</th>
                                                <th className="px-4 py-3">Medicine</th>
                                                <th className="px-3 py-3 text-center">Dosage</th>
                                                <th className="px-3 py-3 text-center">Days</th>
                                                <th className="px-3 py-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {clinicalData.prescriptions.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-3 py-3 text-center text-xs text-text-muted font-bold">{idx + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-white">{item.medicineName}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] text-primary bg-primary/10 px-1 rounded font-bold uppercase">{item.type}</span>
                                                            <span className="text-[10px] text-text-muted italic">{item.instruction}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-xs font-mono text-center text-primary">{item.dosage}</td>
                                                    <td className="px-3 py-3 text-xs text-center font-bold">{item.days}</td>
                                                    <td className="px-3 py-3 text-right">
                                                        <button onClick={() => removeMedicine(idx)} className="text-danger hover:bg-danger/10 p-2 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {clinicalData.prescriptions.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="py-20 text-center text-text-muted italic">No medicines added yet.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Follow-up row */}
                                <div className="mt-3 pt-3 border-t border-border/50 flex gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-text-muted font-bold">Follow Up Day Gap</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={followUpDays}
                                            placeholder={String(clinicalPrefs?.defaultFollowUpDays ?? 10)}
                                            onChange={(e) => {
                                                const days = parseInt(e.target.value);
                                                setFollowUpDays(e.target.value);
                                                if (!isNaN(days) && days > 0) {
                                                    setFollowUpDate(addDays(patient.date, days));
                                                } else {
                                                    setFollowUpDate('');
                                                }
                                            }}
                                            className="w-28 bg-background border border-border rounded px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none text-center"
                                            readOnly={isViewOnly}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] uppercase text-text-muted font-bold">Follow Up Date</label>
                                        <input
                                            type="date"
                                            value={followUpDate}
                                            onChange={(e) => {
                                                setFollowUpDate(e.target.value);
                                                if (e.target.value) {
                                                    setFollowUpDays(String(diffDays(e.target.value, patient.date)));
                                                } else {
                                                    setFollowUpDays('');
                                                }
                                            }}
                                            className="bg-background border border-border rounded px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none w-44"
                                            readOnly={isViewOnly}
                                        />
                                    </div>
                                    {(followUpDate || clinicalPrefs?.defaultFollowUpDays) && (
                                        <div className="text-xs text-primary font-medium pb-1.5">
                                            {isoToDisplay(patient.date)} → {isoToDisplay(followUpDate || addDays(patient.date, clinicalPrefs?.defaultFollowUpDays ?? 10))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>

            )}

            <Modal isOpen={notepadOpen} onClose={() => setNotepadOpen(false)} title={notepadTitle} size="full">
                <div className="flex flex-col h-[70vh]">
                    <div className="bg-primary/10 p-3 rounded-lg mb-4 flex items-center text-sm text-primary"><Edit3 size={16} className="mr-2" /><span>Edit before printing.</span></div>
                    <textarea className="flex-1 w-full bg-white text-black border border-gray-300 rounded-lg p-6 font-sans text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary resize-none" value={notepadContent} onChange={(e) => setNotepadContent(e.target.value)} />
                    <div className="pt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setNotepadOpen(false)}>Cancel</Button><Button onClick={() => { setPreviewType('notepad'); setShowPreview(true); }}><Printer size={16} className="mr-2" /> Print Preview</Button></div>
                </div>
            </Modal>

            {showPreview && (() => {
                const settings = pageSettings || {
                    doctor_id: patient.consultantName || '',
                    paper_size: 'A4',
                    header_enabled: 1,
                    margin_top_cm: 2.0,
                    margin_left_cm: 2.0,
                    margin_right_cm: 2.0,
                    margin_bottom_cm: 2.0
                };
                const getFontSize = (paperSize: 'A4' | 'A5') => {
                    const numMeds = recordToPrint?.data.prescriptions?.length || 0;
                    
                    let visibleNotesLength = 0;
                    if (recordToPrint?.data) {
                        CLINICAL_FIELDS.forEach(({ key }) => {
                            const isVisible = recordToPrint.data.printSettings ? recordToPrint.data.printSettings[key] !== false : true;
                            if (isVisible) {
                                const val = recordToPrint.data[key as keyof ClinicalData];
                                if (typeof val === 'string') {
                                    visibleNotesLength += val.trim().length;
                                }
                            }
                        });
                    }

                    const score = numMeds * 20 + Math.floor(visibleNotesLength / 6);
                    
                    if (paperSize === 'A5') {
                        if (score > 400) return '8.5px';
                        if (score > 300) return '9px';
                        if (score > 200) return '10px';
                        if (score > 100) return '11px';
                        return '12px';
                    } else {
                        // A4
                        if (score > 500) return '10px';
                        if (score > 400) return '11px';
                        if (score > 300) return '12px';
                        if (score > 150) return '13px';
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
                                        onClick={() => { setShowPreview(false); if (viewOnlyRecord) onClose(); }}
                                        className="p-2 hover:bg-white/5 rounded-full transition-colors"
                                        title="Go Back"
                                    >
                                        <ArrowLeft size={20} className="text-white/80" />
                                    </button>
                                    <div>
                                        <h2 className="text-lg font-bold text-white tracking-wide">Print Hub</h2>
                                        <p className="text-xs text-text-muted">Configure document layout</p>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="space-y-3">
                                    <Button 
                                        onClick={handlePrint} 
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl shadow-lg shadow-primary/20 transition-all border-none animate-pulse"
                                    >
                                        <Printer size={18} /> Print Document
                                    </Button>
                                    {previewType === 'prescription' && (
                                        <Button 
                                            onClick={handleWhatsAppPrescription} 
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-sm rounded-xl transition-all border-none"
                                        >
                                            <MessageSquare size={18} /> WhatsApp Share
                                        </Button>
                                    )}
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
                                        .printable-area h1, .printable-area .text-3xl {
                                            font-size: 1.8em !important;
                                        }
                                        .printable-area h2, .printable-area .text-2xl {
                                            font-size: 1.4em !important;
                                        }
                                        .printable-area h3, .printable-area .text-xl, .printable-area .text-lg {
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
                                            * { page-break-inside: avoid !important; break-inside: avoid !important; }
                                        }
                                    `}
                                </style>

                                {/* Clinic Header - Conditionally Hidden */}
                                {settings.header_enabled !== 0 && (
                                    <div className="flex justify-between items-center border-b-4 border-green-700 pb-4 mb-6">
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
                                                <h1 className="text-3xl font-bold text-green-700 tracking-tight uppercase">
                                                    {masterData?.clinicProfile?.hospital_name || masterData?.clinicName || 'SHREE AROGYALAYA HOSPITAL'}
                                                </h1>
                                                {masterData?.clinicProfile?.clinic_name && masterData?.clinicProfile?.clinic_name !== masterData?.clinicProfile?.hospital_name && (
                                                    <p className="text-md font-bold text-green-600 uppercase">{masterData.clinicProfile.clinic_name}</p>
                                                )}
                                                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
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
                                            <p className="font-bold text-xl text-gray-800"> {patient.consultantName}</p>
                                            <p className="text-sm text-gray-600 font-medium">{consultantDesignation}</p>
                                        </div>
                                    </div>
                                )}
                                {previewType === 'prescription' && (
                                    <>
                                        <div className="mb-6 border-b-2 border-gray-200 pb-2 font-sans text-sm">
                                            <div className="flex justify-between mb-2">
                                                <div><span className="font-bold text-gray-700">Name : </span><span className="font-bold text-md uppercase text-gray-800">{patient.title} {patient.firstName} {patient.middleName ? patient.middleName + ' ' : ''}{patient.lastName}</span></div>
                                                <div><span className="font-bold text-gray-700"></span><span className="font-bold font-mono text-gray-800">{patient.uhid}</span></div>
                                            </div>
                                            <div className="flex justify-between">
                                                <div className="flex gap-8">
                                                    <div><span className="font-bold text-gray-700">Age: </span><span className="font-medium text-gray-800">{patient.age}Y/{patient.sex}</span></div>
                                                    <div><span className="font-bold text-gray-700">Date : </span><span className="font-medium text-gray-800">{formatPrintDate(recordToPrint.date)}</span></div>
                                                </div>
                                                <div><span className="font-bold text-gray-700">Visit No : </span><span className="font-medium text-gray-800">{ordinals(recordToPrint.visitCount)}</span></div>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="border-b-2 border-gray-200 mb-3 pb-1"><h3 className="text-xs font-bold uppercase text-gray-900 tracking-wider">Clinical Vitals</h3></div>
                                            <div className="flex flex-col gap-y-1 text-sm text-gray-800">
                                                <div className="flex flex-wrap items-center gap-x-6">
                                                    {recordToPrint.data.vitals?.bp && <span className="font-medium">BP : {recordToPrint.data.vitals.bp} mmHg</span>}
                                                    {recordToPrint.data.vitals?.pulse && <span className="font-medium">Pulse : {recordToPrint.data.vitals.pulse} bpm</span>}
                                                    {recordToPrint.data.vitals?.spo2 && <span className="font-medium">SpO2 : {recordToPrint.data.vitals.spo2} %</span>}
                                                    {recordToPrint.data.vitals?.temp && <span className="font-medium">Temp : {recordToPrint.data.vitals.temp} °F</span>}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-6">
                                                    {recordToPrint.data.vitals?.height && <span className="font-medium">Height : {recordToPrint.data.vitals.height} cm</span>}
                                                    {recordToPrint.data.vitals?.weight && <span className="font-medium">Weight : {recordToPrint.data.vitals.weight} kg</span>}
                                                    {recordToPrint.data.vitals?.bmi && <span className="font-medium">BMI : {recordToPrint.data.vitals.bmi}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Clinical Notes (Excluding Advice/Instruction) */}
                                        <div className="mb-4">
                                            <div className="border-b-2 border-gray-200 mb-3 pb-1"><h3 className="text-xs font-bold uppercase text-gray-900 tracking-wider">Clinical Notes</h3></div>

                                            <div className="px-2">
                                                {CLINICAL_FIELDS.filter(f => !['advice', 'instruction'].includes(f.key)).map(({ key, label }) => {
                                                    const isVisible = recordToPrint.data.printSettings ? recordToPrint.data.printSettings[key] !== false : true;
                                                    if (!isVisible) return null;
                                                    const val = recordToPrint.data[key as keyof ClinicalData];
                                                    if (typeof val !== 'string' || !val.trim()) return null;
                                                    return <div key={key} className="mb-1"><span className="font-bold text-gray-800">{label} : </span><span className="text-black">{val}</span></div>;
                                                })}
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-2"><h3 className="font-serif italic text-2xl  font-bold text-gray-800">Rx - Medicine List</h3></div>
                                            <table className="w-full text-sm text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b-2 border-gray-800">
                                                        <th className="py-2 px-2 w-10 text-gray-600">SR No</th>
                                                        <th className="py-2 px-2 text-gray-600 uppercase text-xs font-bold tracking-wider">Medicine names</th>
                                                        <th className="py-2 px-2 text-gray-600 uppercase text-xs font-bold tracking-wider">Dosage</th>
                                                        <th className="py-2 px-2 text-gray-600 uppercase text-xs font-bold tracking-wider">Instructions</th>
                                                        <th className="py-2 px-2 text-gray-600 uppercase text-xs font-bold tracking-wider text-center">Days</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recordToPrint.data.prescriptions.map((item, idx) => (
                                                        <tr key={idx} className="border-b border-gray-200">
                                                            <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                                                            <td className="py-2 px-2 font-bold text-gray-800"><span className="uppercase">{item.type}.</span> {item.medicineName}</td>
                                                            <td className="py-2 px-2 font-mono">{item.dosage}</td>
                                                            <td className="py-2 px-2 italic text-gray-600">{item.instruction}</td>
                                                            <td className="py-2 px-2 text-center font-bold">{item.days}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Advice and Instruction After Medicine */}
                                        <div className="mb-8 px-2">
                                            {CLINICAL_FIELDS.filter(f => ['advice', 'instruction'].includes(f.key)).map(({ key, label }) => {
                                                const isVisible = recordToPrint.data.printSettings ? recordToPrint.data.printSettings[key] !== false : true;
                                                if (!isVisible) return null;
                                                const val = recordToPrint.data[key as keyof ClinicalData];
                                                if (typeof val !== 'string' || !val.trim()) return null;
                                                return <div key={key} className="mb-2"><span className="font-bold text-gray-800 uppercase text-xs tracking-wider border-b border-gray-300 pb-0.5 mb-1 block w-max">{label}</span><div className="text-black whitespace-pre-wrap">{val}</div></div>;
                                            })}
                                        </div>
                                        <div className="mt-auto pt-12 flex justify-between items-end">
                                            <div className="text-xs text-gray-500">
                                                <p className="font-bold text-gray-700 mb-1">Follow Up:</p>
                                                {recordToPrint.data.nextVisitDate && (
                                                    <p className="text-sm font-bold text-gray-800">{isoToDisplay(recordToPrint.data.nextVisitDate)}</p>
                                                )}
                                                {masterData?.clinicProfile?.footer_text && (
                                                    <p className="mt-2 text-xs font-medium text-gray-700 italic">{masterData.clinicProfile.footer_text}</p>
                                                )}
                                            </div>
                                            <div className="text-center">
                                                <div className="h-16 w-40 mb-2"></div>
                                                <p className="font-bold border-t border-gray-400 text-gray-800">{patient.consultantName}</p>
                                                <p className="text-xs text-gray-600 font-medium">{consultantDesignation}</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {previewType === 'notepad' && (
                                    <div className="flex flex-col h-full">
                                        <h2 className="text-center text-xl font-bold mb-8 mt-4 uppercase text-gray-700 tracking-widest border-b-2 border-gray-200 inline-block mx-auto pb-2">{notepadTitle}</h2>
                                        <div className="text-lg leading-loose text-justify space-y-4 font-sans whitespace-pre-wrap">{notepadContent}</div>
                                        <div className="mt-auto pt-10 text-right"><p className="font-bold text-lg">{patient.consultantName}</p><p className="text-sm font-medium text-gray-700">{consultantDesignation}</p><div className="h-16"></div><p className="text-xs border-t border-black px-8 mt-1 inline-block">Signature & Seal</p></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
};
