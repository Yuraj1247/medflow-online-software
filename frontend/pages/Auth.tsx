
import React, { useState, useEffect } from 'react';
import { UserRole, User } from '../types';
import { Button, Card, Input } from '../components/UI';
import { motion } from 'framer-motion';
import { Stethoscope, UserCircle, ShieldCheck, Code } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setStoredAuth, getUsers, loginAPI, getSubscriptionStatus, API_BASE_URL } from '../services/storage';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoadingUsers(true);
      try {
        // Check subscription status
        const sub = await getSubscriptionStatus();
        if (sub && sub.status === 'EXPIRED') {
          setIsExpired(true);
          setSelectedRole(UserRole.ADMIN);
        }

        // Load users from storage
        const users = await getUsers();
        if (Array.isArray(users)) {
          setAvailableUsers(users);
        } else {
          console.error("Users API did not return an array:", users);
          setAvailableUsers([]);
          setError("Invalid user data received from server.");
        }
      } catch (err) {
        console.error("Failed to load users", err);
        setError("Could not connect to server. Ensure backend is running.");
        setAvailableUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    init();
  }, []);

  // Ensure Admin is auto-selected once users are loaded in expired mode
  useEffect(() => {
    if (isExpired && availableUsers.length > 0 && selectedRole === UserRole.ADMIN && !selectedUserId) {
      const adminUser = availableUsers.find(u => u.role?.toUpperCase() === UserRole.ADMIN);
      if (adminUser) {
        setSelectedUserId(adminUser.id);
      }
    }
  }, [availableUsers, isExpired, selectedRole, selectedUserId]);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setError('');
    setPin('');

    // Auto-select user for ADMIN
    if (role === UserRole.ADMIN) {
      const adminUser = availableUsers.find(u => u.role?.toUpperCase() === UserRole.ADMIN);
      if (adminUser) {
        setSelectedUserId(adminUser.id);
      }
    } else {
      setSelectedUserId('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedRole || !selectedUserId) return;

    try {
      const loggedInUser = await loginAPI(selectedUserId, pin);
      setStoredAuth(loggedInUser);
      onLogin(loggedInUser);
    } catch (e) {
      setError('Invalid PIN code or Login Failed');
    }
  };

  const filteredUsers = Array.isArray(availableUsers) ? availableUsers.filter(u => u.role?.toUpperCase() === selectedRole?.toUpperCase()) : [];


  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[100px]" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-900/20">
              <span className="text-white font-bold text-3xl">M</span>
            </div>
            <h1 className="text-2xl font-heading font-bold text-white">MedFlow Access</h1>
            <p className="text-text-muted mt-2">Secure OPD Management System</p>
          </div>

          {!selectedRole ? (
            <div className="space-y-4">
              <button
                onClick={() => handleRoleSelect(UserRole.ADMIN)}
                className="w-full p-4 flex items-center bg-background border border-border rounded-xl hover:border-red-500 hover:bg-red-500/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                  <ShieldCheck size={24} />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="font-semibold text-text-primary">Admin Access</h3>
                  <p className="text-xs text-text-muted">Configuration & Staff Management</p>
                </div>
              </button>

              {!isExpired && (
                <>
                  <button
                    onClick={() => handleRoleSelect(UserRole.RECEPTIONIST)}
                    className="w-full p-4 flex items-center bg-background border border-border rounded-xl hover:border-blue-500 hover:bg-blue-500/5 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <UserCircle size={24} />
                    </div>
                    <div className="ml-4 text-left">
                      <h3 className="font-semibold text-text-primary">Reception Desk</h3>
                      <p className="text-xs text-text-muted">Manage patients & billing</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleRoleSelect(UserRole.DOCTOR)}
                    className="w-full p-4 flex items-center bg-background border border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                      <Stethoscope size={24} />
                    </div>
                    <div className="ml-4 text-left">
                      <h3 className="font-semibold text-text-primary">Consultant / Doctor</h3>
                      <p className="text-xs text-text-muted">Clinical access & medicines</p>
                    </div>
                  </button>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                {!isExpired && (
                  <button
                    type="button"
                    onClick={() => { setSelectedRole(null); setSelectedUserId(''); setError(''); setPin(''); }}
                    className="text-sm text-text-muted hover:text-white flex items-center"
                  >
                    ← Back to Roles
                  </button>
                )}
                {isExpired && <span className="text-sm text-red-500 font-bold">System Locked: Admin Login Required</span>}
                <span className="text-xs font-mono px-2 py-1 rounded bg-background border border-border text-primary">
                  {selectedRole}
                </span>
              </div>

              {loadingUsers ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-text-muted mt-2">Loading users...</p>
                </div>
              ) : (
                <>
                  {/* User Selection Dropdown - Show ONLY if NOT Admin OR if no Admin is auto-selected */}
                  {(selectedRole !== UserRole.ADMIN || !selectedUserId) && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">Select User</label>
                      <div className="grid gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {filteredUsers.length > 0 ? filteredUsers.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUserId(u.id)}
                            className={`w-full p-3 text-left rounded-lg border transition-all flex justify-between items-center ${selectedUserId === u.id ? 'border-primary bg-primary/10 text-white' : 'border-border bg-background text-text-muted hover:border-gray-600'}`}
                          >
                            <span>{u.name}</span>
                            <span className="text-[10px] uppercase opacity-50">{u.designation}</span>
                          </button>
                        )) : (
                          <div className="text-center text-sm text-text-muted py-4">No users found for this role.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedUserId && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                      <Input
                        type="password"
                        label={selectedRole === UserRole.ADMIN ? "Enter Admin PIN" : "Enter PIN"}
                        placeholder="••••"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="text-center text-2xl tracking-[0.5em] font-mono"
                        autoFocus
                      />
                      {error && (
                        <motion.p
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="text-danger text-sm text-center bg-danger/10 py-2 rounded-lg"
                        >
                          {error}
                        </motion.p>
                      )}
                      <Button type="submit" className="w-full" size="lg">
                        Login
                      </Button>
                    </div>
                  )}
                </>
              )}
            </form>
          )}
        </Card>
      </motion.div>

      {/* Footer Attribution */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-0 right-0 text-center flex flex-col items-center gap-4"
      >
        <button 
          onClick={() => navigate('/developer-login')}
          className="flex items-center gap-2 text-[10px] text-purple-500/50 hover:text-purple-500 font-mono transition-colors uppercase tracking-[0.2em] border border-purple-500/20 px-3 py-1 rounded-full hover:bg-purple-500/5"
        >
          <Code size={12} />
          Developer Login
        </button>

        <a
          href="https://www.designaurastudios.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex flex-col items-center gap-1 hover:scale-105 transition-transform"
        >
          <span className="text-xs text-text-muted/60 font-medium tracking-widest uppercase">Designed and Developed by</span>
          <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">Designaura Studios</span>
          <span className="text-[10px] text-text-muted/40 font-semibold uppercase tracking-[0.2em]">Digital Agency</span>
        </a>
      </motion.div>
    </div>
  );
};

