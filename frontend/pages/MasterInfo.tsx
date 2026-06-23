import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Modal, Select, cn } from '../components/UI';
import { getDoctorPreferences, saveDoctorPreferences, getStoredAuth, getDoctorPageSettings, saveDoctorPageSettings } from '../services/storage';
import { ClinicalPreferences, DoctorPageSettings } from '../types';
import { Trash2, Plus, Edit2, Check, X, RefreshCw, ChevronDown, ChevronUp, Save, User as UserIcon, Layout, Maximize, Settings, Eye } from 'lucide-react';
import { useMasterData } from '../MasterContext';

export const MasterInfo: React.FC = () => {
    const { masterData } = useMasterData();
    // Use ClinicalPreferences type instead of full MasterData
    const [prefs, setPrefs] = useState<ClinicalPreferences | null>(null);
    const [activeTab, setActiveTab] = useState<'clinical' | 'rx' | 'pageSettings'>('clinical');
    const [currentUser, setCurrentUser] = useState(getStoredAuth());

    useEffect(() => {
        const loadData = async () => {
            const user = getStoredAuth();
            setCurrentUser(user);
            if (user) {
                // Load user specific preferences
                const loadedPrefs = await getDoctorPreferences(user.id);
                setPrefs(loadedPrefs);
            }
        };
        loadData();
    }, []);

    // Handlers to update state and storage
    const updateData = async (newPrefs: ClinicalPreferences) => {
        setPrefs(newPrefs);
        if (currentUser) {
            await saveDoctorPreferences(currentUser.id, newPrefs);
        }
    };

    const handleReset = async () => {
        if (!masterData) return;
        if (confirm("Are you sure? This will reset YOUR clinical notes and prescription templates to System Defaults.")) {
            // Use current masterData from context as global defaults
            const resetPrefs: ClinicalPreferences = {
                dosages: masterData.dosages,
                instructions: masterData.instructions,
                clinicalNotes: masterData.clinicalNotes
            };

            await updateData(resetPrefs);
            alert("Your personal preferences have been reset to system defaults.");
        }
    };


    if (!prefs) return <div className="text-white p-6">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-heading font-bold text-white">Doctor Configuration</h1>
                    <p className="text-sm text-text-muted mt-1 flex items-center gap-2">
                        <UserIcon size={14} />
                        Editing preferences for: <span className="text-primary font-bold">{currentUser?.name}</span>
                    </p>
                </div>
                <div className="flex gap-4 items-center">
                    {activeTab !== 'pageSettings' && (
                        <Button variant="danger" size="sm" onClick={handleReset} className="flex items-center gap-2">
                            <RefreshCw size={14} /> Reset My Defaults
                        </Button>
                    )}
                    <div className="flex gap-2 bg-card p-1 rounded-lg border border-border">
                        <button
                            onClick={() => setActiveTab('clinical')}
                            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === 'clinical' ? "bg-primary text-white" : "text-text-muted hover:text-white")}
                        >
                            Clinical Notes
                        </button>
                        <button
                            onClick={() => setActiveTab('rx')}
                            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === 'rx' ? "bg-primary text-white" : "text-text-muted hover:text-white")}
                        >
                            Prescription
                        </button>
                        <button
                            onClick={() => setActiveTab('pageSettings')}
                            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === 'pageSettings' ? "bg-primary text-white" : "text-text-muted hover:text-white")}
                        >
                            Page Settings
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'clinical' ? (
                <ClinicalNotesManager prefs={prefs} updateData={updateData} />
            ) : activeTab === 'rx' ? (
                <div className="max-w-5xl">
                    <DosageManager
                        dosages={prefs.dosages}
                        instructions={prefs.instructions}
                        defaultFollowUpDays={prefs.defaultFollowUpDays ?? 10}
                        onUpdateDosage={(d) => updateData({ ...prefs, dosages: d })}
                        onUpdateInstruction={(i) => updateData({ ...prefs, instructions: i })}
                        onUpdateFollowUpDays={(days) => updateData({ ...prefs, defaultFollowUpDays: days })}
                    />
                </div>
            ) : (
                <PageSettingsManager doctorId={currentUser?.id || ''} />
            )}
        </div>
    );
};

// --- SUB-COMPONENTS ---

const ClinicalNotesManager: React.FC<{ prefs: ClinicalPreferences, updateData: (d: ClinicalPreferences) => void }> = ({ prefs, updateData }) => {
    const [selectedField, setSelectedField] = useState<string>('complaint');

    const fields = [
        { key: 'complaint', label: 'Complaints' },
        { key: 'history', label: 'Medical History' },
        { key: 'findings', label: 'Clinical Findings' },
        { key: 'investigation', label: 'Investigation' },
        { key: 'diagnosis', label: 'Diagnosis' },
        { key: 'actionPlan', label: 'Action Plan' },
        { key: 'advice', label: 'Advice' },
        { key: 'instruction', label: 'Prescription Instruction' }
    ];

    const currentList = prefs.clinicalNotes[selectedField] || [];

    const handleUpdateList = (newList: string[]) => {
        updateData({
            ...prefs,
            clinicalNotes: {
                ...prefs.clinicalNotes,
                [selectedField]: newList
            }
        });
    };

    return (
        <Card className="min-h-[600px]">
            <div className="flex flex-col md:flex-row gap-6 h-full">
                {/* Sidebar selection */}
                <div className="w-full md:w-64 space-y-2 border-r border-border pr-4">
                    <h3 className="text-sm font-bold uppercase text-text-muted mb-4">Select Input Field</h3>
                    {fields.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setSelectedField(f.key)}
                            className={cn(
                                "w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                selectedField === f.key ? "bg-primary/20 text-primary border border-primary/30" : "hover:bg-white/5 text-text-muted"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* List Manager */}
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-6 capitalize">{fields.find(f => f.key === selectedField)?.label} Suggestions</h2>
                    <SimpleListManager
                        title=""
                        items={currentList}
                        onUpdate={handleUpdateList}
                        hideTitle
                    />
                </div>
            </div>
        </Card>
    );
};


// --- GENERIC LIST MANAGER ---

const SimpleListManager: React.FC<{
    title: string,
    items: string[],
    onUpdate: (items: string[]) => void,
    hideTitle?: boolean
}> = ({ title, items, onUpdate, hideTitle }) => {
    // If title is hidden (Clinical Notes/Dosage), it's always open. 
    // If title exists (Basic Details), it starts closed.
    const [isOpen, setIsOpen] = useState(hideTitle ? true : false);

    const [newItem, setNewItem] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const add = () => {
        if (!newItem.trim()) return;
        onUpdate([...items, newItem.trim()]);
        setNewItem('');
    };

    const remove = (idx: number) => {
        if (!confirm('Are you sure?')) return;
        const copy = [...items];
        copy.splice(idx, 1);
        onUpdate(copy);
    };

    const startEdit = (idx: number, val: string) => {
        setEditingIndex(idx);
        setEditValue(val);
    };

    const saveEdit = () => {
        if (editingIndex === null) return;
        const copy = [...items];
        copy[editingIndex] = editValue.trim();
        onUpdate(copy);
        setEditingIndex(null);
    };

    return (
        <Card className={cn(hideTitle ? "h-full border-none shadow-none bg-transparent p-0" : "h-fit transition-all duration-300")}>
            {!hideTitle && (
                <div
                    className="flex justify-between items-center cursor-pointer select-none py-1"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    {isOpen ? <ChevronUp size={20} className="text-text-muted" /> : <ChevronDown size={20} className="text-text-muted" />}
                </div>
            )}

            {isOpen && (
                <div className={cn("flex flex-col animate-in fade-in slide-in-from-top-1", !hideTitle && "mt-4", hideTitle ? "h-full" : "")}>
                    <div className="flex gap-2 mb-4 shrink-0">
                        <Input
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            placeholder="Add new item..."
                        />
                        <Button onClick={add} disabled={!newItem.trim()} size="sm" className="h-[42px]"><Plus size={18} /></Button>
                    </div>

                    <div className={cn("overflow-y-auto space-y-2 pr-2 custom-scrollbar", hideTitle ? "flex-1 min-h-0" : "max-h-[300px]")}>
                        {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-background/50 p-2 rounded border border-border group">
                                {editingIndex === idx ? (
                                    <div className="flex gap-2 w-full">
                                        <input
                                            className="flex-1 bg-black border border-primary rounded px-2 text-sm"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            autoFocus
                                        />
                                        <button onClick={saveEdit} className="text-green-500 hover:text-green-400"><Check size={16} /></button>
                                        <button onClick={() => setEditingIndex(null)} className="text-red-500 hover:text-red-400"><X size={16} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-sm text-text-primary break-all">{item}</span>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                            <button onClick={() => startEdit(idx, item)} className="text-secondary hover:text-blue-400"><Edit2 size={14} /></button>
                                            <button onClick={() => remove(idx)} className="text-danger hover:text-red-400"><Trash2 size={14} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
};

// --- DOSAGE MANAGER ---
const DosageManager: React.FC<{
    dosages: { value: string, label: string }[],
    instructions: { value: string, label: string }[],
    defaultFollowUpDays: number,
    onUpdateDosage: (d: any[]) => void,
    onUpdateInstruction: (i: any[]) => void,
    onUpdateFollowUpDays: (days: number) => void
}> = ({ dosages, instructions, defaultFollowUpDays, onUpdateDosage, onUpdateInstruction, onUpdateFollowUpDays }) => {

    const dosageStrings = dosages.map(d => d.value);
    const instructionStrings = instructions.map(i => i.value);

    const updateDosages = (items: string[]) => {
        onUpdateDosage(items.map(i => ({ value: i, label: i })));
    };

    const updateInstructions = (items: string[]) => {
        onUpdateInstruction(items.map(i => ({ value: i, label: i })));
    };

    return (
        <div className="space-y-6">
            {/* Follow Up Day Gap Config */}
            <Card title="Prescription Configuration">
                <div className="flex items-center gap-6 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex flex-col">
                        <label className="text-sm font-bold text-white mb-1">Default Follow Up Day Gap</label>
                        <p className="text-xs text-text-muted">Number of days after which patient should return for follow-up. Used to auto-calculate follow-up date on prescriptions.</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={defaultFollowUpDays}
                            onChange={(e) => onUpdateFollowUpDays(parseInt(e.target.value) || 10)}
                            className="w-24 bg-background border border-primary/50 rounded-lg px-3 py-2 text-white text-center text-lg font-bold focus:outline-none focus:border-primary"
                        />
                        <span className="text-text-muted text-sm font-medium">days</span>
                    </div>
                </div>
            </Card>

            {/* Dosages & Instructions */}
            <Card title="Dosage &amp; Instruction Templates">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                    <div className="bg-background/20 p-4 rounded-lg border border-border h-[400px] flex flex-col">
                        <h4 className="text-sm font-bold text-text-muted uppercase mb-1">Dosage Frequencies</h4>
                        <p className="text-xs text-text-muted mb-3">e.g. 1-0-1, SOS</p>
                        <SimpleListManager title="" items={dosageStrings} onUpdate={updateDosages} hideTitle />
                    </div>
                    <div className="bg-background/20 p-4 rounded-lg border border-border h-[400px] flex flex-col">
                        <h4 className="text-sm font-bold text-text-muted uppercase mb-1">Instructions</h4>
                        <p className="text-xs text-text-muted mb-3">e.g. After Food</p>
                        <SimpleListManager title="" items={instructionStrings} onUpdate={updateInstructions} hideTitle />
                    </div>
                </div>
            </Card>
        </div>
    );
};

// --- PAGE SETTINGS MANAGER ---

const PageSettingsManager: React.FC<{ doctorId: string }> = ({ doctorId }) => {
    const [settings, setSettings] = useState<DoctorPageSettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            const data = await getDoctorPageSettings(doctorId);
            setSettings(data);
        };
        loadSettings();
    }, [doctorId]);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await saveDoctorPageSettings(settings);
            alert("Page settings saved successfully!");
        } catch (error: any) {
            alert("Failed to save settings: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const updateSetting = (key: keyof DoctorPageSettings, value: any) => {
        if (settings) {
            setSettings({ ...settings, [key]: value });
        }
    };

    if (!settings) return <div className="text-white">Loading settings...</div>;

    // Aspect Ratios for Preview based on real dimensions (A4: 21x29.7cm, A5: 14.8x21cm)
    const paperWidthCm = settings.paper_size === 'A4' ? 21 : 14.8;
    const paperHeightCm = settings.paper_size === 'A4' ? 29.7 : 21;

    // Use a constant scale factor for rendering preview (1cm = 15px)
    const scale = 15;
    const previewWidth = paperWidthCm * scale;
    const previewHeight = paperHeightCm * scale;

    const mt = settings.margin_top_cm * scale;
    const mb = settings.margin_bottom_cm * scale;
    const ml = settings.margin_left_cm * scale;
    const mr = settings.margin_right_cm * scale;

    const printableWidthCm = Math.max(0, paperWidthCm - settings.margin_left_cm - settings.margin_right_cm);
    const printableHeightCm = Math.max(0, paperHeightCm - settings.margin_top_cm - settings.margin_bottom_cm);
    const isPrintableValid = printableWidthCm > 0 && printableHeightCm > 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            {/* Controls */}
            <div className="space-y-6">
                <Card title="Print Layout Configuration">
                    <div className="space-y-8">
                        {/* Header Toggle */}
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-border">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <Layout size={20} />
                                </div>
                                <div>
                                    <p className="font-medium text-white">System Header</p>
                                    <p className="text-xs text-text-muted">Show/Hide clinic header on print</p>
                                </div>
                            </div>
                            <div
                                onClick={() => updateSetting('header_enabled', settings.header_enabled === 1 ? 0 : 1)}
                                className={cn(
                                    "w-12 h-6 rounded-full transition-colors cursor-pointer relative",
                                    settings.header_enabled === 1 ? "bg-primary" : "bg-gray-600"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                    settings.header_enabled === 1 ? "left-7" : "left-1"
                                )} />
                            </div>
                        </div>

                        {/* Paper Size */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                                <Maximize size={14} /> Paper Size
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                {['A4', 'A5'].map((size) => (
                                    <button
                                        key={size}
                                        onClick={() => updateSetting('paper_size', size as any)}
                                        className={cn(
                                            "py-2.5 rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5",
                                            settings.paper_size === size
                                                ? "bg-primary/20 border-primary text-primary shadow-lg shadow-primary/10"
                                                : "bg-white/5 border-border text-text-muted hover:border-white/20"
                                        )}
                                    >
                                        <span className="text-base font-bold">{size}</span>
                                        <span className="text-[10px] text-text-muted font-mono">
                                            {size === 'A4' ? '21.0 × 29.7 cm' : '14.8 × 21.0 cm'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Margins */}
                        <div className="space-y-6">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                                <Settings size={14} /> Margin Controls (cm)
                            </label>

                            <div className="grid grid-cols-2 gap-6">
                                <MarginSlider
                                    label="Top (Header)"
                                    value={settings.margin_top_cm}
                                    onChange={(v) => updateSetting('margin_top_cm', v)}
                                />
                                <MarginSlider
                                    label="Bottom (Footer)"
                                    value={settings.margin_bottom_cm}
                                    onChange={(v) => updateSetting('margin_bottom_cm', v)}
                                />
                                <MarginSlider
                                    label="Left"
                                    value={settings.margin_left_cm}
                                    onChange={(v) => updateSetting('margin_left_cm', v)}
                                />
                                <MarginSlider
                                    label="Right"
                                    value={settings.margin_right_cm}
                                    onChange={(v) => updateSetting('margin_right_cm', v)}
                                />
                            </div>
                        </div>

                        <Button
                            className="w-full h-12 text-lg shadow-xl"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            <Save size={20} className="mr-2" />
                            {isSaving ? "Saving..." : "Save Page Settings"}
                        </Button>
                    </div>
                </Card>
            </div>

            {/* Live Preview */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                        <Eye size={16} /> Real-time Preview
                    </h3>
                    <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-mono font-bold">
                        {settings.paper_size} Size: {paperWidthCm} × {paperHeightCm} cm
                    </span>
                </div>

                <div className="bg-black/40 rounded-3xl p-12 border border-white/5 flex items-center justify-center min-h-[500px] shadow-2xl inset-shadow">
                    {/* The Page Mockup */}
                    <div
                        style={{
                            width: previewWidth,
                            height: previewHeight,
                            backgroundColor: 'white',
                            position: 'relative',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            transition: 'all 0.3s ease-out'
                        }}
                        className="rounded-sm"
                    >
                        {/* Margin Overlays */}
                        {/* Top */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: mt, backgroundColor: 'rgba(59, 130, 246, 0.15)', borderBottom: '1px dashed rgba(59, 130, 246, 0.3)' }} />
                        {/* Bottom */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: mb, backgroundColor: 'rgba(59, 130, 246, 0.15)', borderTop: '1px dashed rgba(59, 130, 246, 0.3)' }} />
                        {/* Left */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: ml, height: '100%', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRight: '1px dashed rgba(59, 130, 246, 0.3)' }} />
                        {/* Right */}
                        <div style={{ position: 'absolute', top: 0, right: 0, width: mr, height: '100%', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '1px dashed rgba(59, 130, 246, 0.3)' }} />

                        {/* Printable Area Indicator */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                            <span className="text-[8px] text-gray-400 uppercase tracking-[0.2em] font-bold mb-1 select-none">Printable Area</span>
                            {isPrintableValid ? (
                                <span className="text-xs font-bold text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/10 select-none">
                                    {printableWidthCm.toFixed(1)} cm × {printableHeightCm.toFixed(1)} cm
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 select-none">
                                    Invalid Margins (Overlap)
                                </span>
                            )}
                        </div>

                        {/* Content Simulation */}
                        <div
                            style={{
                                marginTop: mt,
                                marginLeft: ml,
                                marginRight: mr,
                                marginBottom: mb,
                            }}
                            className="p-2 space-y-2 opacity-30"
                        >
                            {settings.header_enabled === 1 && (
                                <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                            )}
                            <div className="h-2 w-3/4 bg-gray-100 rounded" />
                            <div className="h-2 w-1/2 bg-gray-100 rounded" />
                            <div className="h-20 w-full bg-gray-50 rounded mt-4" />
                            <div className="h-2 w-full bg-gray-100 rounded" />
                            <div className="h-2 w-full bg-gray-100 rounded" />
                        </div>

                        {/* Labels for Margins */}
                        {settings.margin_top_cm > 0 && (
                            <div 
                                className="absolute bg-blue-600 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none select-none z-10 whitespace-nowrap"
                                style={{ top: `${mt / 2}px`, left: '50%', transform: 'translate(-50%, -50%)' }}
                            >
                                Top: {settings.margin_top_cm.toFixed(1)} cm
                            </div>
                        )}
                        {settings.margin_bottom_cm > 0 && (
                            <div 
                                className="absolute bg-blue-600 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none select-none z-10 whitespace-nowrap"
                                style={{ bottom: `${mb / 2}px`, left: '50%', transform: 'translate(-50%, 50%)' }}
                            >
                                Bottom: {settings.margin_bottom_cm.toFixed(1)} cm
                            </div>
                        )}
                        {settings.margin_left_cm > 0 && (
                            <div 
                                className="absolute bg-blue-600 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none select-none z-10 whitespace-nowrap"
                                style={{ left: `${ml / 2}px`, top: '50%', transform: 'translate(-50%, -50%)' }}
                            >
                                Left: {settings.margin_left_cm.toFixed(1)} cm
                            </div>
                        )}
                        {settings.margin_right_cm > 0 && (
                            <div 
                                className="absolute bg-blue-600 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none select-none z-10 whitespace-nowrap"
                                style={{ right: `${mr / 2}px`, top: '50%', transform: 'translate(50%, -50%)' }}
                            >
                                Right: {settings.margin_right_cm.toFixed(1)} cm
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MarginSlider: React.FC<{ label: string, value: number, onChange: (v: number) => void }> = ({ label, value, onChange }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
            <span className="text-text-muted">{label}</span>
            <span className="text-primary font-bold">{value} cm</span>
        </div>
        <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
        />
    </div>
);
