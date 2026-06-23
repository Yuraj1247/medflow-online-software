
import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Search,
  FileText,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Pill,
  ClipboardList,
  Settings,
  BarChart3,
  Shield,
  MessageSquare,
  Calendar
} from 'lucide-react';
import { UserRole, User } from '../types';
import { clearStoredAuth } from '../services/storage';
import { cn } from './UI';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    clearStoredAuth();
    onLogout();
    navigate('/');
  };

  const menuItems = [
    // Admin Only Items
    { icon: Shield, label: "Admin Panel", path: "/admin", roles: [UserRole.ADMIN] },
    { icon: BarChart3, label: "Reports & Analytics", path: "/reports", roles: [UserRole.ADMIN] },

    // Staff Items (Doctors & Receptionists)
    { icon: UserPlus, label: "New Patient", path: "/new-patient", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },

    // Doctor Only
    { icon: ClipboardList, label: "Prescribe", path: "/prescribe", roles: [UserRole.DOCTOR] },

    // Joint Access
    { icon: FileText, label: "Billing", path: "/billing", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },
    { icon: MessageSquare, label: "WhatsApp Messaging", path: "/whatsapp", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },
    { icon: Calendar, label: "Follow Up", path: "/follow-up", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },
    { icon: Search, label: "Search", path: "/search", roles: [UserRole.RECEPTIONIST, UserRole.DOCTOR] },
    { icon: Pill, label: "Medicines", path: "/medicines", roles: [UserRole.DOCTOR] },
    { icon: Settings, label: "Master Info", path: "/master-info", roles: [UserRole.DOCTOR] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user.role));

  // Determine bottom navigation items (max 5)
  const bottomNavItems = (() => {
    if (user.role === UserRole.ADMIN) {
      return [
        { icon: Shield, label: "Admin", path: "/admin" },
        { icon: BarChart3, label: "Reports", path: "/reports" },
        { icon: Search, label: "Search", path: "/search" },
      ];
    }

    const primaryItems = [
      { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
      { icon: UserPlus, label: "Add", path: "/new-patient" },
    ];

    if (user.role === UserRole.DOCTOR) {
      primaryItems.push({ icon: ClipboardList, label: "Prescribe", path: "/prescribe" });
      primaryItems.push({ icon: Pill, label: "Meds", path: "/medicines" });
    } else {
      primaryItems.push({ icon: FileText, label: "Bill", path: "/billing" });
      primaryItems.push({ icon: MessageSquare, label: "Message", path: "/whatsapp" });
    }

    return primaryItems;
  })();

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col lg:flex-row">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[40] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[50] w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-border">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <span className="text-xl font-heading font-bold text-white tracking-tight">MedFlow</span>
            <button className="lg:hidden ml-auto p-2" onClick={() => setSidebarOpen(false)}>
              <X size={20} className="text-text-muted" />
            </button>
          </div>

          {/* User Profile */}
          <div className="px-6 py-6">
            <div className="flex items-center space-x-3 bg-background/50 p-3 rounded-lg border border-border">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-green-700 flex items-center justify-center text-white font-bold shrink-0">
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white">{user.name}</p>
                <p className="text-xs text-text-muted truncate capitalize">{user.designation || user.role}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {filteredMenu.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors group",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-background hover:text-white"
                )}
              >
                <item.icon size={20} className="mr-3" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-border mt-auto mb-16 lg:mb-0 bg-card">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors"
            >
              <LogOut size={20} className="mr-3" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 lg:pb-0">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <span className="text-lg font-heading font-semibold text-white">MedFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              {user.name.charAt(0)}
            </div>
            <button onClick={() => setSidebarOpen(true)} className="text-text-muted hover:text-white p-2">
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Bottom Navigation for Mobile */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border grid grid-cols-4 h-16 z-30">
          {bottomNavItems.slice(0, 4).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 transition-colors",
                  isActive ? "text-primary" : "text-text-muted"
                )}
              >
                <item.icon size={20} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && <div className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />}
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
};

