import React, { useEffect, useState } from 'react';
import { getSubscriptionStatus, SubscriptionStatus, clearStoredAuth } from '../services/storage';
import { Lock, AlertTriangle, PhoneCall, ShieldCheck } from 'lucide-react';
import { UserRole, User } from '../types';

interface Props {
    children: React.ReactNode;
    user: User | null;
}

export const SubscriptionGuard: React.FC<Props> = ({ children, user }) => {
    const [sub, setSub] = useState<SubscriptionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [showLogin, setShowLogin] = useState(false);

    const isAdmin = user?.role === UserRole.ADMIN;

    const checkStatus = async () => {
        try {
            if (isAdmin) {
                setLoading(false);
                return;
            }

            const status = await getSubscriptionStatus();
            setSub(status);
        } catch (error) {
            console.error("Failed to fetch subscription status:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 1000 * 60 * 5); // every 5 mins

        // Listen for manual updates from Admin Panel
        const handleManualUpdate = () => checkStatus();
        window.addEventListener('subscription_updated', handleManualUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener('subscription_updated', handleManualUpdate);
        };
    }, [isAdmin]);


    // When a user successfully logs in, reset the showLogin temporary override
    useEffect(() => {
        if (user) {
            setShowLogin(false);
        }
    }, [user]);

    const handleAdminLogin = () => {
        setShowLogin(true);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[9999]">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-text-muted animate-pulse">Verifying License...</p>
            </div>
        );
    }

    // Bypass for Admins or if Admin Login screen was explicitly requested
    if (isAdmin || showLogin) {
        return <>{children}</>;
    }


    if (sub && sub.status !== 'ACTIVE') {
        const isExpired = sub.status === 'EXPIRED';
        const isTampered = sub.status === 'BLOCKED';

        return (
            <div className="fixed inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center z-[9999] p-6 text-center">
                <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className={isTampered ? "bg-red-500/10 text-red-500 p-4 rounded-full w-fit mx-auto mb-6" : "bg-yellow-500/10 text-yellow-500 p-4 rounded-full w-fit mx-auto mb-6"}>
                        {isTampered ? <AlertTriangle size={48} /> : <Lock size={48} />}
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-2">
                        {isExpired ? "Subscription Expired" : "System Date Error Detected"}
                    </h1>

                    <p className="text-text-muted mb-8 leading-relaxed">
                        {isExpired
                            ? "Your plan has expired. Please contact the developer to renew your license and continue using the software."
                            : "A system date discrepancy has been detected. Please ensure your computer date is correct or contact the developer for assistance."}
                    </p>

                    <div className="space-y-4">
                        {isExpired && (
                            <button
                                onClick={handleAdminLogin}
                                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 rounded-lg shadow-lg hover:bg-primary/90 transition-all mb-2"
                            >
                                <ShieldCheck size={20} />
                                <span>Admin Login</span>
                            </button>
                        )}

                        <div className="flex items-center justify-center gap-2 text-text-muted font-medium text-sm bg-background border border-border py-2 rounded-lg">
                            <PhoneCall size={16} />
                            <span>Contact Developer</span>
                        </div>

                        <p className="text-[10px] text-text-muted uppercase tracking-widest font-mono">
                            Status Code: {sub.status} {sub.code ? `(${sub.code})` : ''}
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => window.location.reload()}
                    className="mt-8 text-sm text-text-muted hover:text-white transition-colors underline underline-offset-4"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    return <>{children}</>;
};
