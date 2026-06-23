
import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Modal, cn } from '../components/UI';
import { useNavigate } from 'react-router-dom';
import { 
    getDeveloperConfig, 
    requestDeveloperOTP, 
    verifyDeveloperOTP, 
    updateSubscriptionAPI,
    getSubscriptionStatus
} from '../services/storage';
import { Shield, Lock, ChevronLeft, Code } from 'lucide-react';
import { DeveloperAccessManager } from '../components/DeveloperAccessManager';
import { useMasterData } from '../MasterContext';
import { SubscriptionStatus } from '../types';

export const DeveloperLogin: React.FC = () => {
    const navigate = useNavigate();
    const { masterData, updateMasterData } = useMasterData();
    const [isAuthorized, setIsAuthorized] = useState(false);
    
    // Auth State
    const [devEmail, setDevEmail] = useState('');
    const [otpRequested, setOtpRequested] = useState(false);
    const [otpTimer, setOtpTimer] = useState(0);
    const [devCodeInput, setDevCodeInput] = useState('');
    const [devAuthError, setDevAuthError] = useState('');
    const [isRequestingOtp, setIsRequestingOtp] = useState(false);
    
    // Data State
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await getDeveloperConfig();
                setDevEmail(config.developer_email);
            } catch (err) {
                console.error("Failed to fetch dev config", err);
            }
        };
        fetchConfig();
        
        const fetchSub = async () => {
            const sub = await getSubscriptionStatus();
            setSubscription(sub);
        };
        fetchSub();
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (otpTimer > 0) {
            interval = setInterval(() => setOtpTimer(prev => prev - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [otpTimer]);

    const handleRequestOTP = async () => {
        setDevAuthError('');
        setIsRequestingOtp(true);
        try {
            await requestDeveloperOTP(devEmail);
            setOtpRequested(true);
            setOtpTimer(180);
        } catch (err: any) {
            setDevAuthError(err.message || "Failed to send OTP. Check internet connection.");
        } finally {
            setIsRequestingOtp(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setDevAuthError('');
        try {
            await verifyDeveloperOTP(devCodeInput);
            setIsAuthorized(true);
        } catch (err: any) {
            setDevAuthError(err.message || "Invalid OTP");
        }
    };

    const handleUpdateSubscription = async (payload: { is_lifetime: boolean, start_date: string, end_date: string }) => {
        await updateSubscriptionAPI(payload);
        const sub = await getSubscriptionStatus();
        setSubscription(sub);
        window.dispatchEvent(new Event('subscription_updated'));
    };

    if (!masterData) return <div className="p-8 text-white">Loading...</div>;

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <button 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-text-muted hover:text-white transition-colors"
                    >
                        <ChevronLeft size={20} />
                        Back to Login
                    </button>
                    <div className="flex items-center gap-2 text-purple-500">
                        <Code size={24} />
                        <h1 className="text-xl font-heading font-bold">Developer Control Center</h1>
                    </div>
                </div>

                {!isAuthorized ? (
                    <div className="flex items-center justify-center pt-12">
                        <Card className="max-w-md w-full border-purple-500/30">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-purple-500/10 text-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                                    <Shield size={32} />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Secure Verification</h2>
                                <p className="text-text-muted mt-2">Enter OTP sent to registered developer email</p>
                            </div>

                            <div className="space-y-4">
                                <Input 
                                    label="Developer Email" 
                                    value={devEmail ? devEmail.replace(/(^.{2}).+(@.+)/, '$1***$2') : ''} 
                                    readOnly 
                                    className="bg-black/50 opacity-70" 
                                />

                                {otpRequested ? (
                                    <form onSubmit={handleVerifyOTP} className="space-y-4 animate-in fade-in">
                                        <Input 
                                            label="6-Digit OTP" 
                                            placeholder="000000" 
                                            value={devCodeInput} 
                                            onChange={e => setDevCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                                            className="text-center text-2xl tracking-[10px] font-mono h-16"
                                            autoFocus
                                        />
                                        <div className="flex justify-between items-center text-xs">
                                            <span className={cn("font-medium", otpTimer > 0 ? "text-primary" : "text-danger")}>
                                                {otpTimer > 0 ? `Expires in ${Math.floor(otpTimer / 60)}:${(otpTimer % 60).toString().padStart(2, '0')}` : 'OTP Expired'}
                                            </span>
                                            {otpTimer === 0 && (
                                                <button type="button" onClick={handleRequestOTP} className="text-purple-400 underline" disabled={isRequestingOtp}>
                                                    {isRequestingOtp ? 'Sending...' : 'Resend OTP'}
                                                </button>
                                            )}
                                        </div>
                                        {devAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{devAuthError}</p>}
                                        <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={devCodeInput.length !== 6 || otpTimer === 0}>
                                            Verify & Grant Access
                                        </Button>
                                    </form>
                                ) : (
                                    <div className="space-y-4">
                                        {devAuthError && <p className="text-danger text-xs bg-danger/10 p-2 rounded text-center">{devAuthError}</p>}
                                        <Button onClick={handleRequestOTP} className="w-full bg-purple-600 hover:bg-purple-700" disabled={isRequestingOtp}>
                                            {isRequestingOtp ? 'Sending OTP...' : 'Send Verification OTP'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                        <DeveloperAccessManager 
                            data={masterData} 
                            onUpdate={updateMasterData} 
                            subscription={subscription}
                            onUpdateSubscription={handleUpdateSubscription}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
