
import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Modal, cn } from './UI';
import { MasterData, SubscriptionStatus } from '../types';
import { 
    getDeveloperConfig, 
    requestDeveloperOTP, 
    verifyDeveloperOTP, 
    deleteDatabase, 
    resetAdminPasswordAPI,
    setAdminEmailAPI
} from '../services/storage';
import { Shield, Lock, Trash2, ToggleLeft, ToggleRight, Users, AlertTriangle, Code } from 'lucide-react';

interface DeveloperAccessManagerProps {
    data: MasterData;
    onUpdate: (data: MasterData) => void;
    subscription: SubscriptionStatus | null;
    onUpdateSubscription: (payload: { is_lifetime: boolean, start_date: string, end_date: string }) => Promise<void>;
}

export const DeveloperAccessManager: React.FC<DeveloperAccessManagerProps> = ({ 
    data, 
    onUpdate, 
    subscription, 
    onUpdateSubscription 
}) => {
    // Local state for limit input to avoid jitter
    const [localLimit, setLocalLimit] = useState(data.totalPatientLimit ?? 100);

    // Subscription States
    const [isLifetime, setIsLifetime] = useState(subscription?.is_lifetime === 1);
    const [startDate, setStartDate] = useState(subscription?.start_date || '');
    const [endDate, setEndDate] = useState(subscription?.end_date || '');
    const [isSaving, setIsSaving] = useState(false);

    // Sync if data changes externally
    useEffect(() => {
        setLocalLimit(data.totalPatientLimit ?? 100);
    }, [data.totalPatientLimit]);

    useEffect(() => {
        if (subscription) {
            setIsLifetime(subscription.is_lifetime === 1);
            setStartDate(subscription.start_date);
            setEndDate(subscription.end_date);
        }
    }, [subscription]);

    const handleLimitChange = (val: number) => {
        setLocalLimit(val);
        onUpdate({ ...data, totalPatientLimit: val });
    };

    const handleSubSave = async () => {
        setIsSaving(true);
        try {
            await onUpdateSubscription({
                is_lifetime: isLifetime,
                start_date: startDate,
                end_date: endDate
            });
            alert("Licensing updated successfully!");
        } catch (e: any) {
            alert(e.message || "Failed to update license");
        } finally {
            setIsSaving(false);
        }
    };

    // --- Admin Email Configuration State ---
    const [configAdminEmail, setConfigAdminEmail] = useState('');
    const [isSavingEmail, setIsSavingEmail] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            const config = await getDeveloperConfig();
            if (config.admin_email) setConfigAdminEmail(config.admin_email);
        };
        fetchConfig();
    }, []);

    const handleSaveAdminEmail = async () => {
        if (!configAdminEmail) return alert("Please enter a valid email");
        setIsSavingEmail(true);
        try {
            await setAdminEmailAPI(configAdminEmail);
            alert("Admin email for deletion successfully set!");
        } catch (err: any) {
            alert("Failed to set email: " + err.message);
        } finally {
            setIsSavingEmail(email => email); // dummy to trigger re-render if needed or just false
            setIsSavingEmail(false);
        }
    };

    // --- Reset Admin Password State ---
    const [isResetAuthOpen, setIsResetAuthOpen] = useState(false);
    const [resetDevEmail, setResetDevEmail] = useState('');
    const [resetOtpRequested, setResetOtpRequested] = useState(false);
    const [resetOtpTimer, setResetOtpTimer] = useState(0);
    const [resetDevCodeInput, setResetDevCodeInput] = useState('');
    const [resetDevAuthError, setResetDevAuthError] = useState('');
    const [isRequestingResetOtp, setIsRequestingResetOtp] = useState(false);

    const [isResetFormOpen, setIsResetFormOpen] = useState(false);
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
    const [resetError, setResetError] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (resetOtpTimer > 0) {
            interval = setInterval(() => setResetOtpTimer(p => p - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [resetOtpTimer]);

    const handleResetAdminClick = async () => {
        try {
            const config = await getDeveloperConfig();
            setResetDevEmail(config.developer_email);
            setIsResetAuthOpen(true);
            setResetOtpRequested(false);
            setResetDevCodeInput('');
            setResetDevAuthError('');
            setResetOtpTimer(0);
        } catch (e) {
            alert("Internet connection required.");
        }
    };

    const handleResetRequestOTP = async () => {
        setResetDevAuthError('');
        setIsRequestingResetOtp(true);
        try {
            await requestDeveloperOTP(resetDevEmail);
            setResetOtpRequested(true);
            setResetOtpTimer(180);
        } catch (err: any) {
            setResetDevAuthError(err.message || 'Failed to send');
        } finally {
            setIsRequestingResetOtp(false);
        }
    };

    const verifyResetOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetDevAuthError('');
        try {
            await verifyDeveloperOTP(resetDevCodeInput);
            setIsResetAuthOpen(false);
            setIsResetFormOpen(true);
            setNewAdminPassword('');
            setConfirmAdminPassword('');
        } catch (err: any) {
            setResetDevAuthError(err.message || "Invalid OTP");
        }
    };

    const handleSaveNewPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetError('');
        if (newAdminPassword !== confirmAdminPassword) {
            setResetError("Passwords do not match");
            return;
        }
        if (newAdminPassword.length < 4) {
            setResetError("Password must be at least 4 characters");
            return;
        }
        setIsResetting(true);
        try {
            await resetAdminPasswordAPI(newAdminPassword);
            alert("Admin password successfully updated!");
            setIsResetFormOpen(false);
        } catch (err: any) {
            setResetError(err.message || "Failed to reset password");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* 1. LICENSING & ACCESS MODE */}
            <Card className="border-l-4 border-l-primary relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Shield size={120} />
                </div>

                <div className="flex items-center gap-2 mb-6">
                    <Lock size={24} className="text-primary" />
                    <h2 className="text-xl font-heading font-bold text-white">Software Licensing (Critical)</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left: Controls */}
                    <div className="lg:col-span-7 space-y-6">
                        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/10">
                            <div>
                                <h3 className="font-bold text-white">Lifetime Access Mode</h3>
                                <p className="text-xs text-text-muted">Disable all expiry and date-rollback checks.</p>
                            </div>
                            <button
                                onClick={() => setIsLifetime(!isLifetime)}
                                className={cn("transition-colors", isLifetime ? "text-primary" : "text-text-muted")}
                            >
                                {isLifetime ? <ToggleRight size={48} /> : <ToggleLeft size={48} />}
                            </button>
                        </div>

                        {!isLifetime && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-4">
                                <Input
                                    label="Start Date"
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                />
                                <Input
                                    label="End Date (Expiry)"
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-4">
                            <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Authorize Changes</h4>
                            <div className="flex flex-col gap-4">
                                <p className="text-xs text-text-muted italic">
                                    Changes will be applied using your current authorized developer session.
                                </p>
                                <Button onClick={handleSubSave} disabled={isSaving} className="h-11 px-8 w-full md:w-auto">
                                    {isSaving ? 'Applying Changes...' : 'Save Licensing Updates'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Info */}
                    <div className="lg:col-span-5 bg-black/40 rounded-xl p-6 border border-white/5 flex flex-col justify-center">
                        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                            Current Status:
                            <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] uppercase",
                                subscription?.status === 'ACTIVE' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                            )}>
                                {subscription?.status || 'UNKNOWN'}
                            </span>
                        </h4>

                        <div className="space-y-3 text-xs">
                            <div className="flex justify-between border-b border-white/5 pb-2 text-text-muted">
                                <span>Mode:</span>
                                <span className="text-white font-medium">{subscription?.is_lifetime ? 'LIFETIME' : 'SUBSCRIPTION'}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2 text-text-muted">
                                <span>Expiry:</span>
                                <span className="text-white font-medium">{subscription?.is_lifetime ? 'NEVER' : subscription?.end_date}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2 text-text-muted">
                                <span>Last Checked:</span>
                                <span className="text-white font-medium">{subscription?.last_checked_date}</span>
                            </div>
                        </div>

                        <p className="mt-6 text-[10px] text-text-muted italic leading-relaxed">
                            LIFETIME mode overrides all date logic. SUBSCRIPTION mode enforces start/end dates and prevents system date tampering (rollback).
                        </p>
                    </div>
                </div>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
                <div className="flex items-center gap-2 mb-6">
                    <Code size={24} className="text-purple-500" />
                    <h2 className="text-xl font-heading font-bold text-white">Feature Restrictions</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* 1. Patient Limits */}
                    <div className="bg-background/20 p-6 rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Users size={18} /> Patient Limiter
                                </h3>
                                <p className="text-xs text-text-muted mt-1">Restrict total lifetime visits/registrations.</p>
                            </div>

                            {/* Toggle */}
                            <button
                                onClick={() => onUpdate({ ...data, enablePatientLimit: !data.enablePatientLimit })}
                                className={cn("transition-colors", data.enablePatientLimit ? "text-primary" : "text-text-muted")}
                                title={data.enablePatientLimit ? "Limiter Active" : "No Limit"}
                            >
                                {data.enablePatientLimit ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                            </button>
                        </div>

                        {/* Limit Input */}
                        <div className={cn("mt-4 transition-opacity", !data.enablePatientLimit && "opacity-40 pointer-events-none")}>
                            <label className="block text-xs font-bold text-text-muted uppercase mb-2">Max Visits Allowed</label>
                            <Input
                                type="number"
                                value={localLimit}
                                onChange={(e) => handleLimitChange(parseInt(e.target.value) || 0)}
                                className="bg-black text-lg font-mono text-primary"
                            />
                            {!data.enablePatientLimit && <p className="text-xs text-yellow-500 mt-2">Limiter is OFF. Unlimited patients allowed.</p>}
                        </div>
                    </div>

                    {/* 2. Staff Management Control */}
                    <div className="bg-background/20 p-6 rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Shield size={18} /> Staff Management
                                </h3>
                                <p className="text-xs text-text-muted mt-1">Allow Admin to Add/Edit/Delete Staff.</p>
                            </div>

                            {/* Toggle */}
                            <button
                                onClick={() => onUpdate({ ...data, enableStaffManagement: !data.enableStaffManagement })}
                                className={cn("transition-colors", data.enableStaffManagement ? "text-primary" : "text-text-muted")}
                                title={data.enableStaffManagement ? "Management Enabled" : "Management Disabled"}
                            >
                                {data.enableStaffManagement ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                            </button>
                        </div>

                        <div className="mt-4">
                            <p className={cn("text-sm p-3 rounded border", data.enableStaffManagement ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400")}>
                                {data.enableStaffManagement
                                    ? "Admin can fully manage staff records."
                                    : "Admin cannot add or modify staff. Tab content will be locked."}
                            </p>
                        </div>
                    </div>

                    {/* 3. Set Admin Email for Deletion */}
                    <div className="bg-background/20 p-6 rounded-lg border border-primary/30 md:col-span-2">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Shield size={18} className="text-primary" /> Set Admin Email for Deletion
                                </h3>
                                <p className="text-xs text-text-muted mt-1">Configure the email address that will receive OTPs for database deletion in the Admin Panel.</p>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Input 
                                placeholder="admin@example.com" 
                                value={configAdminEmail} 
                                onChange={e => setConfigAdminEmail(e.target.value)} 
                                className="flex-1"
                            />
                            <Button onClick={handleSaveAdminEmail} disabled={isSavingEmail} className="h-11 px-8 bg-primary hover:bg-primary/80">
                                {isSavingEmail ? 'Setting...' : 'Set Admin Email'}
                            </Button>
                        </div>
                        <p className="mt-2 text-[10px] text-text-muted italic leading-relaxed">
                            Once set, this email will be used to authorize all database wipes from the Global Settings panel.
                        </p>
                    </div>

                    {/* 4. Admin Password Reset */}
                    <div className="bg-background/20 p-6 rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Lock size={18} /> Admin Password Reset
                                </h3>
                                <p className="text-xs text-text-muted mt-1">Reset Admin password securely via OTP to registered developer email.</p>
                            </div>
                        </div>

                        <Button onClick={handleResetAdminClick} className="h-14 w-full flex items-center justify-center gap-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/50">
                            <Lock size={20} />
                            <span className="font-bold">Reset Admin Password</span>
                        </Button>
                    </div>

                </div>
            </Card>

            {/* OTP Modal for Password Reset */}
            <Modal isOpen={isResetAuthOpen} onClose={() => setIsResetAuthOpen(false)} title="Security Verification" size="md">
                <div className="space-y-6">
                    <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/30">
                        <h3 className="font-bold text-white text-sm">Developer Verification Required</h3>
                        <p className="text-xs text-text-muted mt-1">Enter OTP sent to your registered developer email to proceed with Admin Password Reset.</p>
                    </div>
                    <div className="space-y-4">
                        <Input label="Developer Email" value={resetDevEmail ? resetDevEmail.replace(/(^.{2}).+(@.+)/, '$1***$2') : ''} readOnly className="bg-black/50 opacity-70" />
                        {resetOtpRequested ? (
                            <form onSubmit={verifyResetOTP} className="space-y-4 animate-in fade-in">
                                <Input label="Enter 6-Digit OTP" value={resetDevCodeInput} onChange={e => setResetDevCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))} className="bg-black text-center text-2xl tracking-[10px] font-mono h-16" autoFocus />
                                <div className="flex justify-between items-center text-xs">
                                    <span className={cn("font-medium", resetOtpTimer > 0 ? "text-primary" : "text-danger")}>
                                        {resetOtpTimer > 0 ? `Expires in ${Math.floor(resetOtpTimer / 60)}:${(resetOtpTimer % 60).toString().padStart(2, '0')}` : 'OTP Expired'}
                                    </span>
                                    {resetOtpTimer === 0 && (
                                        <button type="button" onClick={handleResetRequestOTP} className="text-purple-400 underline">Resend OTP</button>
                                    )}
                                </div>
                                {resetDevAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{resetDevAuthError}</p>}
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsResetAuthOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={resetDevCodeInput.length !== 6 || resetOtpTimer === 0} className="flex-[2] bg-purple-600">Verify</Button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                {resetDevAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{resetDevAuthError}</p>}
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1" onClick={() => setIsResetAuthOpen(false)}>Cancel</Button>
                                    <Button onClick={handleResetRequestOTP} disabled={isRequestingResetOtp} className="flex-[2] bg-purple-600">
                                        {isRequestingResetOtp ? 'Sending...' : 'Send OTP'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Admin Password Reset Modal */}
            <Modal isOpen={isResetFormOpen} onClose={() => setIsResetFormOpen(false)} title="Admin Password Reset" size="md">
                <form onSubmit={handleSaveNewPassword} className="space-y-6">
                    <div className="space-y-4">
                        <Input type="password" label="New Password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} required />
                        <Input type="password" label="Re-enter New Password" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} required />
                    </div>
                    {resetError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center font-medium">{resetError}</p>}
                    <div className="flex gap-2 pt-2">
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsResetFormOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={isResetting || !newAdminPassword || !confirmAdminPassword} className="flex-[2] bg-green-600 hover:bg-green-700">
                            {isResetting ? 'Saving...' : 'Save Password'}
                        </Button>
                    </div>
                </form>
            </Modal>

        </div>
    );
};
