
import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Select, Table, Modal, cn } from '../components/UI';
import { User, RoleDefinition, UserRole, MasterData, SubscriptionStatus } from '../types';
import { 
    getUsers, 
    saveUser, 
    deleteUser, 
    getRoles, 
    saveRole, 
    deleteRole, 
    getMasterData, 
    saveMasterData, 
    updateConsultantNameInRecords, 
    getSubscriptionStatus, 
    updateSubscriptionAPI, 
    importDatabase, 
    getExportDatabaseUrl, 
    deleteDatabase,
    requestDeveloperOTP,
    verifyDeveloperOTP,
    requestDeletionOTPAPI
} from '../services/storage';
import { Trash2, Edit2, Plus, Users, Shield, Settings, BarChart3, Save, Check, X, Search, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, DollarSign, MapPin, FileText, Activity, Lock, Database, Upload, Download, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PatientSearch } from './PatientSearch';
import { useMasterData } from '../MasterContext';
import { DeveloperAccessManager } from '../components/DeveloperAccessManager';

// --- SUB COMPONENTS DEFINITIONS ---


// Reusable List Manager for Global Settings
const SimpleListManager: React.FC<{
    title: string,
    items: string[],
    onUpdate: (items: string[]) => void,
    placeholder?: string,
    icon?: React.ElementType
}> = ({ title, items, onUpdate, placeholder, icon: Icon }) => {
    const [newItem, setNewItem] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const add = () => {
        if (!newItem.trim()) return;
        onUpdate([...items, newItem.trim()]);
        setNewItem('');
    };

    const remove = (idx: number) => {
        if (!window.confirm('Are you sure?')) return;
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
        <Card className="h-fit border-t-4 border-t-secondary/50">
            <div
                className="flex justify-between items-center cursor-pointer select-none py-1"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    {Icon && <Icon size={18} className="text-secondary" />}
                    <h3 className="text-base font-bold text-white">{title}</h3>
                </div>
                {isOpen ? <ChevronUp size={18} className="text-text-muted" /> : <ChevronDown size={18} className="text-text-muted" />}
            </div>

            {isOpen && (
                <div className="space-y-4 mt-4 animate-in fade-in">
                    <div className="flex gap-2 mb-4">
                        <Input
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            placeholder={placeholder || "Add new item..."}
                            className="h-9 text-sm"
                        />
                        <Button onClick={add} disabled={!newItem.trim()} size="sm" className="h-9 w-9 p-0 flex items-center justify-center"><Plus size={18} /></Button>
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-background/50 p-2 rounded border border-border group hover:border-secondary/30 transition-colors">
                                {editingIndex === idx ? (
                                    <div className="flex gap-2 w-full">
                                        <input
                                            className="flex-1 bg-black border border-primary rounded px-2 py-1 text-sm focus:outline-none"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            autoFocus
                                        />
                                        <button onClick={saveEdit} className="text-green-500 hover:text-green-400"><Check size={16} /></button>
                                        <button onClick={() => setEditingIndex(null)} className="text-red-500 hover:text-red-400"><X size={16} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-sm text-text-primary">{item}</span>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(idx, item)} className="text-secondary hover:text-blue-400"><Edit2 size={14} /></button>
                                            <button onClick={() => remove(idx)} className="text-danger hover:text-red-400"><Trash2 size={14} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {items.length === 0 && <div className="text-xs text-text-muted text-center py-2 italic">No items added.</div>}
                    </div>
                </div>
            )}
        </Card>
    );
};

// Manager for Bill Particulars (Name + Rate)
const BillParticularsManager: React.FC<{
    items: { name: string, defaultRate: number }[],
    onUpdate: (items: { name: string, defaultRate: number }[]) => void
}> = ({ items, onUpdate }) => {
    const [isOpen, setIsOpen] = useState(false); // Default closed as requested
    const [newName, setNewName] = useState('');
    const [newRate, setNewRate] = useState('');

    // Editing State
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editRate, setEditRate] = useState('');

    const add = () => {
        if (!newName.trim() || !newRate) return;
        onUpdate([...items, { name: newName.trim(), defaultRate: parseFloat(newRate) }]);
        setNewName('');
        setNewRate('');
    };

    const remove = (idx: number) => {
        if (!confirm('Remove this billing item?')) return;
        const copy = [...items];
        copy.splice(idx, 1);
        onUpdate(copy);
    };

    const startEdit = (index: number, item: { name: string, defaultRate: number }) => {
        setEditingIndex(index);
        setEditName(item.name);
        setEditRate(item.defaultRate.toString());
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditName('');
        setEditRate('');
    };

    const saveEdit = () => {
        if (editingIndex === null) return;
        if (!editName.trim() || !editRate) return;

        const copy = [...items];
        copy[editingIndex] = {
            name: editName.trim(),
            defaultRate: parseFloat(editRate)
        };
        onUpdate(copy);
        setEditingIndex(null);
    };

    return (
        <Card className="h-full border-t-4 border-t-green-500">
            <div
                className="flex justify-between items-center cursor-pointer select-none py-1 mb-4"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <DollarSign size={20} className="text-green-500" />
                    <h3 className="text-lg font-bold text-white">Bill Particulars & Rates</h3>
                </div>
                {isOpen ? <ChevronUp size={20} className="text-text-muted" /> : <ChevronDown size={20} className="text-text-muted" />}
            </div>

            {isOpen && (
                <div className="animate-in fade-in flex flex-col h-[calc(100%-3rem)]">
                    {/* Add New Section */}
                    <div className="flex gap-2 mb-4 items-end bg-white/5 p-3 rounded-lg border border-border">
                        <div className="flex-1">
                            <Input placeholder="Item Name (e.g. Consultation)" value={newName} onChange={e => setNewName(e.target.value)} className="h-9 text-sm" label="New Particular" />
                        </div>
                        <div className="w-28">
                            <Input type="number" placeholder="Rate" value={newRate} onChange={e => setNewRate(e.target.value)} className="h-9 text-sm" label="Rate (₹)" />
                        </div>
                        <Button onClick={add} size="sm" className="h-9 mb-[1px]"><Plus size={16} className="mr-1" /> Add</Button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-[300px]">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-background/50 p-3 rounded border border-border group hover:border-green-500/30 transition-colors">
                                {editingIndex === idx ? (
                                    <div className="flex gap-2 w-full items-center">
                                        <div className="flex-1">
                                            <input
                                                className="w-full bg-black border border-primary rounded px-2 py-1 text-sm focus:outline-none"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder="Name"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="w-24">
                                            <input
                                                type="number"
                                                className="w-full bg-black border border-primary rounded px-2 py-1 text-sm focus:outline-none"
                                                value={editRate}
                                                onChange={(e) => setEditRate(e.target.value)}
                                                placeholder="Rate"
                                            />
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={saveEdit} className="p-1 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white transition-colors" title="Save"><Check size={16} /></button>
                                            <button onClick={cancelEdit} className="p-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors" title="Cancel"><X size={16} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-sm font-medium">{item.name}</span>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">₹{item.defaultRate}</span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => startEdit(idx, item)} className="text-secondary hover:text-blue-400 transition-colors"><Edit2 size={14} /></button>
                                                <button onClick={() => remove(idx)} className="text-danger hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {items.length === 0 && <div className="text-center text-text-muted italic py-10">No items configured.</div>}
                    </div>
                </div>
            )}
        </Card>
    );
};

// --- STATE CITY MANAGER ---

const StateCityManager: React.FC<{
    data: Record<string, string[]>,
    onUpdate: (d: Record<string, string[]>) => void
}> = ({ data, onUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedState, setSelectedState] = useState<string | null>(null);
    const [newState, setNewState] = useState('');
    const [newCity, setNewCity] = useState('');

    const addState = () => {
        if (!newState.trim()) return;
        if (data[newState]) {
            alert('State already exists');
            return;
        }
        onUpdate({ ...data, [newState.trim()]: [] });
        setNewState('');
    };

    const deleteState = (state: string) => {
        if (!confirm(`Delete ${state} and all its cities?`)) return;
        const copy = { ...data };
        delete copy[state];
        onUpdate(copy);
        if (selectedState === state) setSelectedState(null);
    };

    const addCity = () => {
        if (!selectedState || !newCity.trim()) return;
        const cities = data[selectedState] || [];
        if (cities.includes(newCity.trim())) return;
        onUpdate({ ...data, [selectedState]: [...cities, newCity.trim()] });
        setNewCity('');
    };

    const deleteCity = (city: string) => {
        if (!selectedState) return;
        const cities = data[selectedState].filter(c => c !== city);
        onUpdate({ ...data, [selectedState]: cities });
    };

    return (
        <Card className="h-fit transition-all duration-300 border-t-4 border-t-blue-500">
            <div
                className="flex justify-between items-center cursor-pointer select-none py-1"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <MapPin size={20} className="text-blue-500" />
                    <h3 className="text-lg font-heading font-semibold text-text-primary">States & Cities</h3>
                </div>
                {isOpen ? <ChevronUp size={20} className="text-text-muted" /> : <ChevronDown size={20} className="text-text-muted" />}
            </div>

            {isOpen && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                    <div>
                        <h4 className="text-sm font-bold text-text-muted uppercase mb-2">States</h4>
                        <div className="flex gap-2 mb-3">
                            <Input value={newState} onChange={e => setNewState(e.target.value)} placeholder="New State Name" className="h-9 text-sm" />
                            <Button onClick={addState} size="sm" className="h-9"><Plus /></Button>
                        </div>
                        <div className="h-[200px] overflow-y-auto border border-border rounded-lg p-2 space-y-1 custom-scrollbar">
                            {Object.keys(data).sort().map(state => (
                                <div
                                    key={state}
                                    onClick={() => setSelectedState(state)}
                                    className={cn(
                                        "p-2 rounded cursor-pointer flex justify-between items-center text-sm transition-colors",
                                        selectedState === state ? "bg-primary text-white" : "hover:bg-white/5 text-text-muted"
                                    )}
                                >
                                    <span>{state}</span>
                                    <button onClick={(e) => { e.stopPropagation(); deleteState(state) }} className="hover:text-red-300"><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-text-muted uppercase mb-2">
                            Cities in {selectedState ? <span className="text-primary">{selectedState}</span> : '...'}
                        </h4>
                        {selectedState ? (
                            <>
                                <div className="flex gap-2 mb-3">
                                    <Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="New City Name" className="h-9 text-sm" />
                                    <Button onClick={addCity} size="sm" className="h-9"><Plus /></Button>
                                </div>
                                <div className="h-[200px] overflow-y-auto border border-border rounded-lg p-2 space-y-1 custom-scrollbar">
                                    {data[selectedState].sort().map(city => (
                                        <div key={city} className="p-2 rounded flex justify-between items-center text-sm bg-background/30 border border-transparent hover:border-border">
                                            <span>{city}</span>
                                            <button onClick={() => deleteCity(city)} className="text-danger hover:text-red-400"><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-text-muted text-sm italic border border-border border-dashed rounded-lg bg-background/20">
                                Select a state to manage cities
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
};

const StaffManager: React.FC<{ users: User[], roles: RoleDefinition[], doctorRoles: string[], onUpdate: () => void, isEnabled: boolean }> = ({ users, roles, doctorRoles, onUpdate, isEnabled }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<User>>({
        name: '',
        role: UserRole.DOCTOR,
        designation: '',
        pin: ''
    });

    if (!isEnabled) {
        return (
            <Card className="flex flex-col items-center justify-center p-12 text-center h-[400px] border-l-4 border-l-red-500">
                <Lock size={64} className="text-text-muted mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white mb-2">Staff Management Disabled</h3>
                <p className="text-text-muted max-w-sm">
                    Access to add, edit, or delete staff members has been restricted by the Developer.
                    Please contact support to enable this feature.
                </p>
            </Card>
        );
    }

    const openAdd = () => {
        setEditingUser(null);
        setFormData({ name: '', role: UserRole.DOCTOR, designation: '', pin: '' });
        setIsModalOpen(true);
    };

    const openEdit = (u: User) => {
        setEditingUser(u);
        setFormData({ ...u });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.pin) {
            alert("Name and PIN are required");
            return;
        }

        // If doctor, designation (Type) is required
        if (formData.role === UserRole.DOCTOR && !formData.designation) {
            alert("Please select a specialty type for the Doctor");
            return;
        }

        // Auto-assign designation for Receptionist
        let finalDesignation = formData.designation;
        if (formData.role === UserRole.RECEPTIONIST) {
            finalDesignation = 'Receptionist';
        }

        // CHECK IF RENAMING AN EXISTING DOCTOR
        if (editingUser && editingUser.role === UserRole.DOCTOR && editingUser.name !== formData.name) {
            const confirmRename = window.confirm(
                `Renaming Consultant from "${editingUser.name}" to "${formData.name}".\n\nThis will instantly update all historical Patients, Bills, and Master Data records associated with this name. Continue?`
            );

            if (confirmRename) {
                updateConsultantNameInRecords(editingUser.name, formData.name!);
            } else {
                return; // Abort save
            }
        }

        const payload: User = {
            id: editingUser ? editingUser.id : Math.random().toString(36).substr(2, 9),
            name: formData.name!,
            role: formData.role!, // System Role
            designation: finalDesignation!, // Specialty or Title
            pin: formData.pin!
        };

        try {
            await saveUser(payload);
            setIsModalOpen(false);
            onUpdate();
        } catch (err: any) {
            alert(err.message || "Failed to save user. Please check if server is reachable.");
        }
    };


    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure? This user will lose access immediately.")) {
            await deleteUser(id);
            onUpdate();
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in">
            <div className="flex justify-end">
                <Button onClick={openAdd}><Plus size={16} className="mr-2" /> Add Staff Member</Button>
            </div>

            <Card className="p-0 overflow-hidden">
                <Table headers={['Name', 'Role / Type', 'System Permission', 'PIN', 'Actions']}>
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 font-medium">{u.name}</td>
                            <td className="px-4 py-3">{u.designation}</td>
                            <td className="px-4 py-3">
                                <span className={cn(
                                    "text-xs px-2 py-1 rounded",
                                    u.role === UserRole.ADMIN ? "bg-red-500/10 text-red-500" :
                                        u.role === UserRole.DOCTOR ? "bg-green-500/10 text-green-500" :
                                            "bg-blue-500/10 text-blue-500"
                                )}>
                                    {u.role}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">****</td>
                            <td className="px-4 py-3 flex gap-2">
                                <button onClick={() => openEdit(u)} className="text-secondary hover:text-blue-400" title="Edit"><Edit2 size={16} /></button>
                                {u.role !== UserRole.ADMIN && (
                                    <button onClick={() => handleDelete(u.id)} className="text-danger hover:text-red-400" title="Delete"><Trash2 size={16} /></button>
                                )}
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>

            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Edit Staff Details' : 'Add New Staff'} size="md">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input label="Full Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Dr. John Doe" />

                        {/* Role Selection - DISABLED if Editing */}
                        <div className="space-y-1">
                            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">Role</label>
                            <select
                                className={cn(
                                    "w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary",
                                    editingUser && "opacity-60 cursor-not-allowed bg-white/5"
                                )}
                                value={formData.role}
                                onChange={e => {
                                    const newRole = e.target.value as UserRole;
                                    setFormData({ ...formData, role: newRole, designation: '' });
                                }}
                                disabled={!!editingUser} // Prevent role change during edit
                            >
                                <option value={UserRole.DOCTOR}>Doctor (Consultant)</option>
                                <option value={UserRole.RECEPTIONIST}>Receptionist</option>
                                {/* ADMIN Option Removed - Cannot add more admins */}
                                {editingUser?.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>Administrator</option>}
                            </select>
                            {editingUser && <p className="text-[10px] text-text-muted italic">Role cannot be changed once created.</p>}
                        </div>

                        {/* Doctor Specialty - Show if Doctor */}
                        {formData.role === UserRole.DOCTOR && (
                            <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">Doctor Type / Specialty</label>
                                <select
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary"
                                    value={formData.designation}
                                    onChange={e => setFormData({ ...formData, designation: e.target.value })}
                                    required
                                >
                                    <option value="">Select Specialty...</option>
                                    {doctorRoles.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-text-muted">Manage this list in Global Settings</p>
                            </div>
                        )}

                        <Input
                            label="Set PIN Code"
                            value={formData.pin}
                            onChange={e => setFormData({ ...formData, pin: e.target.value })}
                            placeholder="4-digit Login PIN"
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button type="submit">Save Staff</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

// --- GLOBAL SETTINGS MANAGER ---
const GlobalSettingsManager: React.FC<{
    data: MasterData,
    onUpdate: (d: MasterData) => void
}> = ({ data, onUpdate }) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("Start database import? This will merge new data with existing records.")) {
            e.target.value = ''; // Reset
            return;
        }

        setImporting(true);
        try {
            const res: any = await importDatabase(file);
            alert(`Import Successful!\nPatients Imported: ${res.details?.patients}\nVisits Imported: ${res.details?.visits}`);
            window.location.reload(); // Reload to show new data
        } catch (err: any) {
            alert("Import Failed: " + err.message);
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleExport = () => {
        const url = getExportDatabaseUrl();
        window.open(url, '_blank');
    };

    // --- Delete Database OTP State ---
    const [isDeleteAuthOpen, setIsDeleteAuthOpen] = useState(false);
    const [deleteOtpRequested, setDeleteOtpRequested] = useState(false);
    const [deleteOtpTimer, setDeleteOtpTimer] = useState(0);
    const [deleteOtpInput, setDeleteOtpInput] = useState('');
    const [deleteAuthError, setDeleteAuthError] = useState('');
    const [isRequestingDeleteOtp, setIsRequestingDeleteOtp] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (deleteOtpTimer > 0) {
            interval = setInterval(() => setDeleteOtpTimer(p => p - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [deleteOtpTimer]);

    const handleDeleteDBClick = () => {
        setIsDeleteAuthOpen(true);
        setDeleteOtpRequested(false);
        setDeleteOtpInput('');
        setDeleteAuthError('');
        setDeleteOtpTimer(0);
    };

    const handleRequestDeleteOTP = async () => {
        setDeleteAuthError('');
        setIsRequestingDeleteOtp(true);
        try {
            await requestDeletionOTPAPI();
            setDeleteOtpRequested(true);
            setDeleteOtpTimer(300); // 5 minutes
        } catch (err: any) {
            setDeleteAuthError(err.message || 'Failed to send OTP');
        } finally {
            setIsRequestingDeleteOtp(false);
        }
    };

    const verifyDeleteOTPAndWipe = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteAuthError('');
        try {
            await verifyDeveloperOTP(deleteOtpInput);
            setDeleting(true);
            setIsDeleteAuthOpen(false);
            try {
                await deleteDatabase();
                alert("Database cleared successfully.");
                window.location.reload();
            } catch (err: any) {
                alert("Delete Failed: " + err.message);
            } finally {
                setDeleting(false);
            }
        } catch (err: any) {
            setDeleteAuthError(err.message || "Invalid OTP");
        }
    };



    return (
        <div className="space-y-6 animate-in fade-in">
            {/* 0. DATABASE MANAGEMENT */}
            <Card className="border-t-4 border-t-amber-500 bg-card/60">
                <div className="flex items-center gap-2 mb-4">
                    <Database className="text-amber-500" size={20} />
                    <h3 className="font-bold text-lg text-white">Database Management</h3>
                </div>
                <p className="text-sm text-text-muted mb-4">Manage your clinic data carefully. Backups are recommended before operations.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button onClick={handleImportClick} disabled={importing} variant="secondary" className="h-24 flex flex-col gap-2 border-dashed">
                        <Upload size={24} className={importing ? "animate-bounce" : ""} />
                        <span>{importing ? "Importing..." : "Import Database"}</span>
                        <span className="text-[10px] text-text-muted">Merge .sqlite file</span>
                    </Button>
                    <input type="file" ref={fileInputRef} hidden onChange={handleFileChange} accept=".sqlite,.db" />

                    <Button onClick={handleExport} variant="secondary" className="h-24 flex flex-col gap-2 border-dashed">
                        <Download size={24} />
                        <span>Export Database</span>
                        <span className="text-[10px] text-text-muted">Download .sqlite backup</span>
                    </Button>

                    <Button onClick={handleDeleteDBClick} variant="danger" className="h-24 flex flex-col gap-2 border-dashed bg-red-500/5 hover:bg-red-500/10 border-red-500/30 text-red-500 md:col-span-2">
                        <Trash2 size={24} />
                        <span className="font-bold">Delete Database</span>
                        <span className="text-[10px] opacity-70 italic">Permanently wipe all clinical records</span>
                    </Button>
                </div>
            </Card>

            {/* Delete Database Modal */}
            <Modal isOpen={isDeleteAuthOpen} onClose={() => setIsDeleteAuthOpen(false)} title="Security Verification: Delete Data" size="md">
                <div className="space-y-6">
                    <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/30">
                        <h3 className="font-bold text-red-500 text-sm">Critical Action Required</h3>
                        <p className="text-xs text-text-muted mt-1">
                            Clicking the button below will send a 6-digit OTP to the <b>Admin Email</b> pre-configured by the Developer.
                            Verify the OTP to permanently delete all records.
                        </p>
                    </div>
                    <div className="space-y-4">
                        {deleteOtpRequested ? (
                            <form onSubmit={verifyDeleteOTPAndWipe} className="space-y-4 animate-in fade-in">
                                <Input label="Enter 6-Digit OTP" value={deleteOtpInput} onChange={e => setDeleteOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))} className="bg-black text-center text-2xl tracking-[10px] font-mono h-16" autoFocus />
                                <div className="flex justify-between items-center text-xs">
                                    <span className={cn("font-medium", deleteOtpTimer > 0 ? "text-primary" : "text-danger")}>
                                        {deleteOtpTimer > 0 ? `Expires in ${Math.floor(deleteOtpTimer / 60)}:${(deleteOtpTimer % 60).toString().padStart(2, '0')}` : 'OTP Expired'}
                                    </span>
                                    {deleteOtpTimer === 0 && (
                                        <button type="button" onClick={handleRequestDeleteOTP} className="text-red-400 underline">Resend OTP</button>
                                    )}
                                </div>
                                {deleteAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{deleteAuthError}</p>}
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsDeleteAuthOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={deleteOtpInput.length !== 6 || deleteOtpTimer === 0} className="flex-[2] bg-red-600 hover:bg-red-700">Verify & Delete</Button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                {deleteAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{deleteAuthError}</p>}
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1" onClick={() => setIsDeleteAuthOpen(false)}>Cancel</Button>
                                    <Button onClick={handleRequestDeleteOTP} disabled={isRequestingDeleteOtp} className="flex-[2] bg-red-600 hover:bg-red-700">
                                        {isRequestingDeleteOtp ? 'Sending...' : 'Send OTP to Admin Email'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* 1. TOP BAR: SYSTEM & SECURITY */}
            <Card className="bg-card/50 border-primary/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="text-red-500" size={20} />
                            <h3 className="font-bold text-lg text-white">System Controls</h3>
                        </div>
                        <p className="text-sm text-text-muted">Configure billing toggles.</p>
                    </div>

                    <div className="flex gap-4 flex-wrap">
                        {/* Discount Toggle */}
                        <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-lg border border-border">
                            <div className="text-right">
                                <span className="block text-xs font-bold text-text-muted uppercase">Discounts</span>
                                <span className="text-[10px] text-text-muted/70">{data.enableDiscount ? 'Enabled' : 'Disabled'}</span>
                            </div>
                            <button
                                onClick={() => onUpdate({ ...data, enableDiscount: !data.enableDiscount })}
                                className={cn("transition-colors", data.enableDiscount ? "text-primary" : "text-text-muted")}
                            >
                                {data.enableDiscount ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                            </button>
                        </div>

                        {/* GST Toggle */}
                        <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-lg border border-border">
                            <div className="text-right">
                                <span className="block text-xs font-bold text-text-muted uppercase">GST Tax</span>
                                <span className="text-[10px] text-text-muted/70">{data.enableGst ? `Enabled (${data.gstRate || 18}%)` : 'Disabled'}</span>
                            </div>
                            <button
                                onClick={() => onUpdate({ ...data, enableGst: !data.enableGst })}
                                className={cn("transition-colors", data.enableGst ? "text-primary" : "text-text-muted")}
                            >
                                {data.enableGst ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                            </button>

                            {/* GST Rate Input */}
                            {data.enableGst && (
                                <div className="ml-2 w-16 border-l border-border pl-2 animate-in fade-in slide-in-from-left-2">
                                    <span className="block text-[8px] font-bold text-text-muted uppercase mb-0.5">Rate %</span>
                                    <input
                                        type="number"
                                        value={data.gstRate}
                                        onChange={(e) => onUpdate({ ...data, gstRate: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-transparent border-b border-text-muted text-white text-sm focus:outline-none focus:border-primary text-center"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* 1.5 CLINIC INFO SECTION */}
            <Card className="border-t-4 border-t-blue-500">
                <div className="flex items-center gap-2 mb-4">
                    <FileText className="text-blue-500" size={20} />
                    <h3 className="font-bold text-lg text-white">Hospital / Clinic Profile</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <Input
                            label="Hospital Name"
                            value={data.clinicName || ''}
                            onChange={(e) => onUpdate({ ...data, clinicName: e.target.value })}
                            placeholder="e.g. SHREE AROGYALAYA HOSPITAL"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input
                            label="Complete Address"
                            value={data.clinicAddress || ''}
                            onChange={(e) => onUpdate({ ...data, clinicAddress: e.target.value })}
                            placeholder="Street, Area, City, Pin Code"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input
                            label="Contact Info (Phone / Email / Website)"
                            value={data.clinicContact || ''}
                            onChange={(e) => onUpdate({ ...data, clinicContact: e.target.value })}
                            placeholder="+91 00000 00000 | email@domain.com"
                        />
                    </div>
                </div>
            </Card>

            {/* 2. MAIN GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT: FINANCIAL SETTINGS (Particulars) */}
                <div className="lg:col-span-6 space-y-6">
                    <BillParticularsManager
                        items={data.billParticulars}
                        onUpdate={(items) => onUpdate({ ...data, billParticulars: items })}
                    />
                </div>

                {/* RIGHT: OPERATIONAL SETTINGS (Lists) */}
                <div className="lg:col-span-6 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min">
                    <SimpleListManager
                        title="Medicine Types"
                        items={data.medicineTypes || []}
                        onUpdate={(items) => onUpdate({ ...data, medicineTypes: items })}
                        placeholder="e.g. Tablet"
                        icon={Activity}
                    />

                    <SimpleListManager
                        title="Doctor Specialties"
                        items={data.doctorRoles || []}
                        onUpdate={(items) => onUpdate({ ...data, doctorRoles: items })}
                        placeholder="e.g. Dentist"
                        icon={Activity}
                    />

                    <SimpleListManager
                        title="Payment Modes"
                        items={data.paymentModes}
                        onUpdate={(items) => onUpdate({ ...data, paymentModes: items })}
                        placeholder="e.g. UPI, Card"
                        icon={DollarSign}
                    />

                    <SimpleListManager
                        title="Payment Sources"
                        items={data.paymentBy}
                        onUpdate={(items) => onUpdate({ ...data, paymentBy: items })}
                        placeholder="e.g. Insurance"
                        icon={Users}
                    />

                    <SimpleListManager
                        title="Referral Sources"
                        items={data.referredBy}
                        onUpdate={(items) => onUpdate({ ...data, referredBy: items })}
                        icon={Users}
                    />

                    <SimpleListManager
                        title="Visit Purpose"
                        items={data.purposeOfVisit}
                        onUpdate={(items) => onUpdate({ ...data, purposeOfVisit: items })}
                        icon={FileText}
                    />

                    <SimpleListManager
                        title="ID Proofs"
                        items={data.idProofs}
                        onUpdate={(items) => onUpdate({ ...data, idProofs: items })}
                        icon={FileText}
                    />
                </div>

                {/* BOTTOM: GEOGRAPHY */}
                <div className="lg:col-span-12">
                    <StateCityManager
                        data={data.statesAndCities}
                        onUpdate={(sc) => onUpdate({ ...data, statesAndCities: sc })}
                    />
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const AdminPanel: React.FC = () => {
    const navigate = useNavigate();
    const { masterData, updateMasterData, refreshMasterData } = useMasterData();
    const [activeTab, setActiveTab] = useState<'staff' | 'search' | 'settings'>('staff');

    // --- Data States ---
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<RoleDefinition[]>([]);
    const [doctorRoles, setDoctorRoles] = useState<string[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

    useEffect(() => {
        refreshData();
    }, [masterData]);

    const refreshData = async () => {
        setUsers(await getUsers());
        setRoles(await getRoles());
        setSubscription(await getSubscriptionStatus());
        if (masterData) {
            setDoctorRoles(masterData.doctorRoles || []);
        }
    };

    if (!masterData) {
        return <div className="p-8 text-white flex justify-center items-center h-full">Loading Admin Panel...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-heading font-bold text-white flex items-center gap-2">
                    <Shield className="text-red-500" /> Admin Panel
                </h1>
                <Button onClick={() => navigate('/reports')} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700">
                    <BarChart3 size={18} /> View Reports & Analytics
                </Button>
            </div>

            {/* Tab Nav */}
            <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('staff')}
                    className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap", activeTab === 'staff' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white")}
                >
                    <Users size={16} /> Manage Staff
                </button>
                <button
                    onClick={() => setActiveTab('search')}
                    className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap", activeTab === 'search' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white")}
                >
                    <Search size={16} /> Patient Search
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap", activeTab === 'settings' ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-white")}
                >
                    <Settings size={16} /> Global Settings
                </button>
            </div>

            {activeTab === 'staff' && (
                <StaffManager
                    users={Array.isArray(users) ? users : []}
                    roles={roles}
                    doctorRoles={doctorRoles}
                    onUpdate={refreshData}
                    isEnabled={masterData.enableStaffManagement}
                />
            )}

            {/* REUSE PATIENT SEARCH COMPONENT DIRECTLY */}
            {activeTab === 'search' && (
                <div className="animate-in fade-in">
                    <PatientSearch />
                </div>
            )}

            {activeTab === 'settings' && (
                <GlobalSettingsManager
                    data={masterData}
                    onUpdate={updateMasterData}
                />
            )}
        </div>
    );
};

