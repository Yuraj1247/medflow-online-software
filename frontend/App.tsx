import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { PatientForm } from './pages/PatientForm';
import { PatientSearch } from './pages/PatientSearch';
import { Billing } from './pages/Billing';
import { MedicineMaster } from './pages/MedicineMaster';
import { Prescribe } from './pages/Prescribe';
import { MasterInfo } from './pages/MasterInfo';
import { Reports } from './pages/Reports';
import { AdminPanel } from './pages/AdminPanel';
import WhatsappPage from './pages/WhatsappPage';
import { FollowUp } from './pages/FollowUp';
import { DeveloperLogin } from './pages/DeveloperLogin';
import { Layout } from './components/Layout';
import { User, UserRole } from './types';
import { getStoredAuth } from './services/storage';
import { MasterProvider } from './MasterContext';
import { SubscriptionGuard } from './components/SubscriptionGuard';

const App: React.FC = () => {

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = getStoredAuth();
    if (storedUser) {
      // Fix-up: If doctor name missing 'Dr.' prefix in session, update it
      if (storedUser.role?.toUpperCase() === UserRole.DOCTOR && !storedUser.name.toLowerCase().startsWith('dr.')) {
        const updated = { ...storedUser, name: `Dr. ${storedUser.name.trim().replace(/^dr\s+/i, '')}` };
        sessionStorage.setItem('medflow_auth_user', JSON.stringify(updated));
        sessionStorage.setItem('auth_token', JSON.stringify(updated));
        setUser(updated);
      } else {
        setUser(storedUser);
      }
    }
  }, []);

  const handleLogin = (newUser: User) => {
    if (newUser.role?.toUpperCase() === UserRole.DOCTOR && !newUser.name.toLowerCase().startsWith('dr.')) {
      const updated = { ...newUser, name: `Dr. ${newUser.name.trim().replace(/^dr\s+/i, '')}` };
      sessionStorage.setItem('auth_token', JSON.stringify(updated));
      setUser(updated);
    } else {
      setUser(newUser);
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  // Protected Route Component
  const ProtectedRoute = ({ children, roles }: { children?: React.ReactNode, roles?: UserRole[] }) => {
    if (!user) {
      return <Navigate to="/" replace />;
    }

    // Role-based access control
    if (roles && !roles.map(r => r.toUpperCase()).includes(user.role?.toUpperCase() as UserRole)) {
      // If unauthorized, redirect based on role
      if (user.role?.toUpperCase() === UserRole.ADMIN) {
        return <Navigate to="/admin" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }

    return <Layout user={user} onLogout={handleLogout}>{children}</Layout>;
  };

  return (
    <Router>
      <SubscriptionGuard user={user}>
        <MasterProvider>

          <Routes>
            {/* Auth Route - Redirect based on role */}
            <Route path="/" element={
              user ? (
                user.role?.toUpperCase() === UserRole.ADMIN ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />
              ) : <Auth onLogin={handleLogin} />
            } />

            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute roles={[UserRole.RECEPTIONIST, UserRole.DOCTOR]}>
                <Dashboard user={user!} />
              </ProtectedRoute>
            } />

            <Route path="/new-patient" element={
              <ProtectedRoute roles={[UserRole.RECEPTIONIST, UserRole.DOCTOR]}>
                <PatientForm />
              </ProtectedRoute>
            } />

            <Route path="/search" element={
              <ProtectedRoute>
                <PatientSearch />
              </ProtectedRoute>
            } />

            <Route path="/billing" element={
              <ProtectedRoute roles={[UserRole.RECEPTIONIST, UserRole.DOCTOR]}>
                <Billing />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute roles={[UserRole.ADMIN]}>
                <AdminPanel />
              </ProtectedRoute>
            } />

            {/* Doctor Only Routes */}
            <Route path="/medicines" element={
              <ProtectedRoute roles={[UserRole.DOCTOR, UserRole.ADMIN]}>
                <MedicineMaster />
              </ProtectedRoute>
            } />

            <Route path="/prescribe" element={
              <ProtectedRoute roles={[UserRole.DOCTOR]}>
                <Prescribe user={user!} />
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute roles={[UserRole.ADMIN]}>
                <Reports />
              </ProtectedRoute>
            } />

            <Route path="/master-info" element={
              <ProtectedRoute roles={[UserRole.DOCTOR, UserRole.ADMIN]}>
                <MasterInfo />
              </ProtectedRoute>
            } />

            <Route path="/whatsapp" element={
              <ProtectedRoute roles={[UserRole.RECEPTIONIST, UserRole.DOCTOR]}>
                <WhatsappPage />
              </ProtectedRoute>
            } />

            <Route path="/follow-up" element={
              <ProtectedRoute roles={[UserRole.RECEPTIONIST, UserRole.DOCTOR]}>
                <FollowUp />
              </ProtectedRoute>
            } />

            <Route path="/developer-login" element={<DeveloperLogin />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MasterProvider>
      </SubscriptionGuard>
    </Router>
  );
};

export default App;
