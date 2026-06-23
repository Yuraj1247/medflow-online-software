
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Input, Button, cn } from '../components/UI';
import { getBills, getPatients, getMedicines, getAllVisits } from '../services/storage';
import { Bill, Patient, Medicine } from '../types';
import {
    Download, BarChart3, TrendingUp, Users, DollarSign, Pill,
    Calendar, Activity, PieChart as PieIcon, MapPin, Stethoscope,
    ArrowUpRight, ArrowDownRight, Briefcase
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useMasterData } from '../MasterContext';
import { ClinicalAnalytics } from './ClinicalAnalytics';
import { OverallAnalytics } from './OverallAnalytics';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart
} from 'recharts';


type MainTab = 'opd_register' | 'clinic_analytics';
type AnalyticsTab = 'overall' | 'revenue' | 'medicine' | 'patient';

const COLORS = ['#22C55E', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1', '#A855F7', '#D946EF'];

// Custom Tooltip for Charts
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-card border border-border p-3 rounded-lg shadow-xl">
                <p className="text-white font-bold text-sm mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} className="text-xs" style={{ color: entry.color || entry.fill }}>
                        {entry.name}: <span className="font-mono font-bold">{entry.value.toLocaleString()}</span>
                        {entry.unit ? ` ${entry.unit}` : ''}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export const Reports: React.FC = () => {
    const { masterData } = useMasterData();
    const [activeTab, setActiveTab] = useState<MainTab>('opd_register');
    const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('overall');

    const [bills, setBills] = useState<Bill[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [visits, setVisits] = useState<any[]>([]);

    // Date Filters for OPD Register
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const lastDay = new Date(year, month, 0).getDate();
        const monthStr = String(month).padStart(2, '0');
        const lastDayStr = String(lastDay).padStart(2, '0');
        return `${year}-${monthStr}-${lastDayStr}`;
    });

    // Date Filters for Clinic Analytics (Defaults to last 30 days)
    const [analyticsStartDate, setAnalyticsStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [analyticsEndDate, setAnalyticsEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    useEffect(() => {
        const loadData = async () => {
            try {
                const [b, p, v] = await Promise.all([
                    getBills(),
                    getPatients(),
                    getAllVisits()
                ]);
                setBills(b);
                setPatients(p);
                setVisits(v);
            } catch (e) {
                console.error("Failed to load report data", e);
            }
        };
        loadData();
    }, []);

    // --- HELPER: Amount Calculation (mirrors Billing.tsx calculateFinals) ---
    const calculateFinalAmount = (bill: Bill) => {
        const subTotal = bill.total; // bill.total = sum of items (subtotal, pre-discount, pre-GST)
        let discount = 0;
        if (masterData?.enableDiscount) {
            if (bill.discountType === 'Percentage') {
                discount = (subTotal * Math.min(bill.discountValue || 0, 100)) / 100;
            } else {
                discount = Math.min(bill.discountValue || 0, subTotal);
            }
        }
        const taxable = Math.max(0, subTotal - discount);
        const gstPercent = masterData?.gstRate || 18;
        const tax = (masterData?.enableGst) ? taxable * (gstPercent / 100) : 0;
        const net = taxable + tax;
        return { discount, net, taxable, tax };
    };


    // --- OPD REGISTER DATA ---
    const filteredVisits = useMemo(() => {
        return visits.filter(v => {
            return v.visitDate >= startDate && v.visitDate <= endDate;
        }).sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.visitId - b.visitId);
    }, [visits, startDate, endDate]);

    const opdRegisterData = useMemo(() => {
        return filteredVisits.map(visit => {
            const bill = bills.find(b => b.uhid === visit.uhid && b.visitCount === visit.visitCount);
            return {
                visit,
                bill
            };
        });
    }, [filteredVisits, bills]);

    const handleExportOPD = () => {
        if (opdRegisterData.length === 0) {
            alert("No data available to export.");
            return;
        }
        const exportData = opdRegisterData.map(({ visit, bill }, index) => {
            const billDetails = bill ? calculateFinalAmount(bill) : null;
            const [y, m, d] = visit.visitDate.split('-');
            return {
                "Sr No": index + 1,
                "UHID": visit.uhid,
                "Date": `${d}/${m}/${y}`,
                "Patient Name": `${visit.title} ${visit.firstName} ${visit.lastName}`,
                "Mobile": visit.mobile || '-',
                "Consultant": visit.consultantName,
                "Purpose / Bill Items": bill ? bill.items.map(i => i.particulars).join(', ') : (visit.purposeOfVisit || 'Consultation'),
                "SubTotal": bill ? bill.total : 0,
                "Discount": billDetails ? billDetails.discount.toFixed(2) : '0.00',
                "Tax (GST)": billDetails ? billDetails.tax.toFixed(2) : '0.00',
                "Net Amount": billDetails ? billDetails.net.toFixed(2) : '0.00',
                "Mode": bill ? (bill.paymentMode || 'CASH') : 'No Bill'
            };
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "OPD Register");
        XLSX.writeFile(wb, `OPD_Register_${startDate}_to_${endDate}.xlsx`);
    };

    // ==================================================================================
    // ADVANCED ANALYTICS DATA PROCESSING
    // ==================================================================================

    // 1. REVENUE DEEP DIVE
    const revenueAnalytics = useMemo(() => {
        const dailyMap: Record<string, number> = {};
        const monthlyMap: Record<string, number> = {};
        const consultantRev: Record<string, number> = {};
        const serviceMap: Record<string, number> = {}; // Procedure vs Consultation etc
        const dayOfWeekMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => ({ name: d, value: 0 }));

        let totalRevenue = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        // Last 30 Days Filler
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyMap[key] = 0;
        }

        bills.forEach(bill => {
            const { net, discount, tax } = calculateFinalAmount(bill);
            const date = bill.date;
            const month = date.substring(0, 7); // YYYY-MM

            // Daily
            if (dailyMap[date] !== undefined) dailyMap[date] += net;
            // Monthly
            monthlyMap[month] = (monthlyMap[month] || 0) + net;
            // Consultant
            consultantRev[bill.consultant] = (consultantRev[bill.consultant] || 0) + net;
            // Day of Week
            const dayIdx = new Date(date).getDay();
            dayOfWeekMap[dayIdx].value += net;

            // Service Breakdown (Item Parsing)
            bill.items.forEach(item => {
                // Heuristic grouping based on name
                let category = 'Other';
                const name = item.particulars.toLowerCase();
                if (name.includes('consult')) category = 'Consultation';
                else if (name.includes('follow')) category = 'Follow-up';
                else if (name.includes('inj') || name.includes('dress') || name.includes('procedure')) category = 'Procedures';
                else if (name.includes('lab') || name.includes('test') || name.includes('ecg')) category = 'Diagnostics';
                else category = 'General';

                serviceMap[category] = (serviceMap[category] || 0) + item.amount;
            });

            totalRevenue += net;
            totalDiscount += discount;
            totalTax += tax;
        });

        const dailyData = Object.entries(dailyMap).map(([date, amount]) => ({
            date: date.substring(5), // MM-DD
            fullDate: date,
            amount
        })).sort((a, b) => a.fullDate.localeCompare(b.fullDate));

        const consultantData = Object.entries(consultantRev)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const serviceData = Object.entries(serviceMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        return {
            dailyData,
            monthlyData: Object.entries(monthlyMap).map(([m, v]) => ({ name: m, value: v })).sort((a, b) => a.name.localeCompare(b.name)),
            consultantData,
            serviceData,
            dayOfWeekData: dayOfWeekMap,
            kpi: { totalRevenue, totalDiscount, totalTax, avgBill: bills.length ? totalRevenue / bills.length : 0 }
        };
    }, [bills, masterData]);

    // 2. PATIENT DEEP DIVE
    const patientAnalytics = useMemo(() => {
        const referralMap: Record<string, number> = {};
        const purposeMap: Record<string, number> = {};
        const ageGroups = { '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '51-60': 0, '60+': 0 };
        const cityMap: Record<string, number> = {};

        patients.forEach(p => {
            // Referrals
            referralMap[p.referredBy] = (referralMap[p.referredBy] || 0) + 1;
            // Purpose
            purposeMap[p.purposeOfVisit] = (purposeMap[p.purposeOfVisit] || 0) + 1;
            // City
            if (p.city) cityMap[p.city] = (cityMap[p.city] || 0) + 1;

            // Age Group
            const age = p.age || 0;
            if (age <= 10) ageGroups['0-10']++;
            else if (age <= 20) ageGroups['11-20']++;
            else if (age <= 30) ageGroups['21-30']++;
            else if (age <= 40) ageGroups['31-40']++;
            else if (age <= 50) ageGroups['41-50']++;
            else if (age <= 60) ageGroups['51-60']++;
            else ageGroups['60+']++;
        });

        return {
            referralData: Object.entries(referralMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            purposeData: Object.entries(purposeMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            cityData: Object.entries(cityMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
            ageData: Object.entries(ageGroups).map(([name, value]) => ({ name, value })),
            kpi: {
                total: patients.length,
                newPatients: patients.filter(p => p.userType === 'New').length,
                returning: patients.filter(p => p.userType === 'Old').length
            }
        };
    }, [patients]);

    // 3. MEDICINE DEEP DIVE
    const medicineAnalytics = useMemo(() => {
        const medMap: Record<string, number> = {};
        const typeMap: Record<string, number> = {};
        let totalItems = 0;

        patients.forEach(p => {
            (p.prescriptionHistory || []).forEach(rx => {
                rx.data.prescriptions.forEach(item => {
                    medMap[item.medicineName] = (medMap[item.medicineName] || 0) + 1;
                    typeMap[item.type] = (typeMap[item.type] || 0) + 1;
                    totalItems++;
                });
            });
        });

        return {
            topMeds: Object.entries(medMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15),
            typeData: Object.entries(typeMap).map(([name, value]) => ({ name, value })),
            totalItems
        };
    }, [patients]);

    // 4. OVERALL / DIAGNOSIS
    const overallAnalytics = useMemo(() => {
        const diagnosisMap: Record<string, number> = {};
        let totalVisits = 0;

        patients.forEach(p => {
            totalVisits += (p.visitCount || 1);
            (p.prescriptionHistory || []).forEach(rx => {
                if (rx.data.diagnosis) {
                    // Simple comma/semicolon split
                    rx.data.diagnosis.split(/[,;]/).forEach(d => {
                        const t = d.trim();
                        if (t) diagnosisMap[t] = (diagnosisMap[t] || 0) + 1;
                    });
                }
            });
        });

        return {
            diagnosisData: Object.entries(diagnosisMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10),
            totalVisits
        };
    }, [patients]);

    // --- RENDER COMPONENT ---

    const KPICard = ({ title, value, subtext, trend, icon: Icon, color }: any) => (
        <Card className="relative overflow-hidden group hover:border-opacity-50 transition-all border-border">
            <div className={`absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
                <Icon size={64} />
            </div>
            <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-white mb-1">{value}</h3>
                {subtext && <p className="text-xs text-text-muted">{subtext}</p>}
                {trend && (
                    <div className={`flex items-center text-xs mt-2 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trend > 0 ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                        {Math.abs(trend)}% vs last month
                    </div>
                )}
            </div>
        </Card>
    );

    if (!masterData) return <div className="p-8 text-white">Loading Reports...</div>;

    return (
        <div className="space-y-6">
            {/* HEADER & TABS */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold text-white flex items-center gap-2">
                        <Activity className="text-primary" /> Reports & Analytics
                    </h1>
                    <p className="text-sm text-text-muted mt-1">Advanced data insights for clinical and financial performance</p>
                </div>
                <div className="bg-card p-1 rounded-lg border border-border flex">
                    <button
                        onClick={() => setActiveTab('opd_register')}
                        className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === 'opd_register' ? "bg-primary text-white" : "text-text-muted hover:text-white")}
                    >
                        OPD Register
                    </button>
                    <button
                        onClick={() => setActiveTab('clinic_analytics')}
                        className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === 'clinic_analytics' ? "bg-primary text-white" : "text-text-muted hover:text-white")}
                    >
                        Clinic Analytics
                    </button>
                </div>
            </div>

            {/* ======================= OPD REGISTER VIEW ======================= */}
            {activeTab === 'opd_register' && (
                <Card className="space-y-6 animate-in fade-in">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-border pb-6">
                        <div className="flex gap-4 items-end">
                            <div className="w-40">
                                <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            </div>
                            <div className="w-40">
                                <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleExportOPD} className="flex items-center gap-2">
                            <Download size={18} /> Export Excel
                        </Button>
                    </div>

                    <div className="overflow-x-auto border border-border rounded-lg max-h-[600px]">
                        <table className="w-full text-sm text-left relative">
                            <thead className="bg-card text-text-muted uppercase text-xs sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3">Sr.</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">UHID</th>
                                    <th className="px-4 py-3">Patient Name</th>
                                    <th className="px-4 py-3">Details</th>
                                    <th className="px-4 py-3 text-right">Sub Total</th>
                                    <th className="px-4 py-3 text-right">Discount</th>
                                    <th className="px-4 py-3 text-right">Net Amount</th>
                                    <th className="px-4 py-3 text-right">Mode</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-background/50">
                                {opdRegisterData.length > 0 ? opdRegisterData.map(({ visit, bill }, index) => {
                                    const billDetails = bill ? calculateFinalAmount(bill) : null;
                                    const [y, m, d] = visit.visitDate.split('-');
                                    return (
                                        <tr key={visit.visitId} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 text-text-muted">{index + 1}</td>
                                            <td className="px-4 py-3 font-mono text-xs text-text-muted">{`${d}/${m}/${y}`}</td>
                                            <td className="px-4 py-3 font-mono text-primary text-xs">{visit.uhid}</td>
                                            <td className="px-4 py-3 font-medium">
                                                {visit.title} {visit.firstName} {visit.lastName}
                                                <div className="text-[10px] text-text-muted">{visit.consultantName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-text-muted truncate max-w-[120px]">
                                                {bill ? bill.items.map(i => i.particulars).join(', ') : (visit.purposeOfVisit || 'Consultation')}
                                            </td>
                                            <td className="px-4 py-3 text-right text-text-muted">
                                                {bill ? `₹${bill.total.toFixed(0)}` : <span className="text-text-muted opacity-40">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right text-red-400 text-xs">
                                                {billDetails && billDetails.discount > 0 ? `- ₹${billDetails.discount.toFixed(0)}` : <span className="text-text-muted opacity-40">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-white">
                                                {billDetails ? `₹${billDetails.net.toFixed(2)}` : <span className="text-text-muted opacity-40">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {bill ? (
                                                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded">{bill.paymentMode}</span>
                                                ) : (
                                                    <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded font-medium">No Bill</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan={9} className="px-4 py-8 text-center text-text-muted">No records found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}


            {/* ======================= CLINIC ANALYTICS VIEW ======================= */}
            {activeTab === 'clinic_analytics' && (
                <div className="space-y-6 animate-in fade-in">

                    {/* --- SUB NAVIGATION --- */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { id: 'overall', label: "Today's Analytics", icon: Calendar },
                            { id: 'revenue', label: 'Financial Performance', icon: DollarSign },
                            { id: 'medicine', label: 'Pharmacy & Inventory', icon: Pill },
                            { id: 'patient', label: 'Patient Demographics', icon: Users },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setAnalyticsTab(tab.id as AnalyticsTab)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center",
                                    analyticsTab === tab.id
                                        ? "bg-primary text-white border-primary shadow-lg shadow-green-900/20 scale-[1.02]"
                                        : "bg-card text-text-muted border-border hover:border-primary/50 hover:bg-card/80"
                                )}
                            >
                                <tab.icon size={24} className="mb-2 opacity-80" />
                                <span className="font-semibold text-sm">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* --- DATE FILTER FOR OVERALL ANALYTICS --- */}
                    {analyticsTab !== 'overall' && (
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card/40 p-4 rounded-xl border border-border">
                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Duration:</span>
                                <div className="w-40">
                                    <Input
                                        type="date"
                                        value={analyticsStartDate}
                                        onChange={(e) => setAnalyticsStartDate(e.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>
                                <span className="text-text-muted text-xs">to</span>
                                <div className="w-40">
                                    <Input
                                        type="date"
                                        value={analyticsEndDate}
                                        onChange={(e) => setAnalyticsEndDate(e.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>
                            <span className="text-[11px] text-primary/80 bg-primary/10 px-2.5 py-1 rounded font-medium">
                                Filtered Data (All-time scope)
                            </span>
                        </div>
                    )}

                    {/* --- TODAY'S ANALYTICS TAB --- */}
                    {analyticsTab === 'overall' && (
                        <ClinicalAnalytics />
                    )}

                    {/* --- REVENUE TAB --- */}
                    {analyticsTab === 'revenue' && (
                        <OverallAnalytics section="revenue" startDate={analyticsStartDate} endDate={analyticsEndDate} />
                    )}

                    {/* --- MEDICINE TAB --- */}
                    {analyticsTab === 'medicine' && (
                        <OverallAnalytics section="medicine" startDate={analyticsStartDate} endDate={analyticsEndDate} />
                    )}

                    {/* --- PATIENT TAB --- */}
                    {analyticsTab === 'patient' && (
                        <OverallAnalytics section="patient" startDate={analyticsStartDate} endDate={analyticsEndDate} />
                    )}

                </div>
            )}
        </div>
    );
};
