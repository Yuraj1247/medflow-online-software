import React, { useState, useEffect, useRef } from 'react';
import { getTodayAnalytics } from '../services/storage';
import {
    TrendingUp, Users, Pill, RefreshCw, DollarSign, Activity,
    MapPin, BarChart2, PieChart, AlertCircle, Loader2, Calendar
} from 'lucide-react';

// ─── Utility ────────────────────────────────────────────────────
const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

const COLORS = [
    '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
    '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9',
    '#fbbf24', '#2dd4bf', '#818cf8', '#4ade80', '#f87171'
];

// ─── Mini Circular Progress (donut slice) ───────────────────────
const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 160 }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) {
        return (
            <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
                <PieChart size={32} className="text-text-muted opacity-30" />
                <span className="text-xs text-text-muted mt-1">No data</span>
            </div>
        );
    }

    let cumulative = 0;
    const r = (size / 2) - 16;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="28" />
            {data.map((d, i) => {
                const pct = d.value / total;
                const offset = circumference - cumulative * circumference;
                const dasharray = `${pct * circumference} ${(1 - pct) * circumference}`;
                cumulative += pct;
                return (
                    <circle
                        key={i}
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke={d.color}
                        strokeWidth="28"
                        strokeDasharray={dasharray}
                        strokeDashoffset={offset}
                        strokeLinecap="butt"
                        transform={`rotate(-90 ${cx} ${cy})`}
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                );
            })}
            <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" fill="white" fontSize="18" fontWeight="700">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">Total</text>
        </svg>
    );
};

// ─── Bar Chart ───────────────────────────────────────────────────
const BarChart: React.FC<{
    data: { label: string; value: number; percentage?: number; color?: string }[];
    maxValue?: number;
    showPercentage?: boolean;
    colorful?: boolean;
}> = ({ data, maxValue, showPercentage = false, colorful = false }) => {
    const max = maxValue || Math.max(...data.map(d => d.value), 1);
    if (data.length === 0) {
        return <div className="flex items-center justify-center h-32 text-text-muted text-sm italic">No data available</div>;
    }
    return (
        <div className="space-y-2.5">
            {data.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-text-muted w-28 truncate flex-shrink-0" title={d.label}>{d.label}</span>
                    <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                        <div
                            className="h-full rounded flex items-center px-2"
                            style={{
                                width: `${(d.value / max) * 100}%`,
                                background: colorful
                                    ? `${COLORS[i % COLORS.length]}cc`
                                    : 'linear-gradient(90deg, #6366f1cc, #818cf8cc)',
                                transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                                minWidth: d.value > 0 ? '4px' : '0'
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 w-20 justify-end">
                        <span className="text-xs font-bold text-white">{d.value}</span>
                        {showPercentage && d.percentage !== undefined && (
                            <span className="text-xs text-text-muted">({d.percentage}%)</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Section Card ─────────────────────────────────────────────────
const SectionCard: React.FC<{
    title: string;
    icon: React.ElementType;
    color: string;
    children: React.ReactNode;
    className?: string;
}> = ({ title, icon: Icon, color, children, className = '' }) => (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden ${className}`}>
        <div className={`px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5`} style={{ background: `${color}18` }}>
            <div className="p-1.5 rounded-lg" style={{ background: `${color}30` }}>
                <Icon size={16} style={{ color }} />
            </div>
            <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ─── Stat Badge ──────────────────────────────────────────────────
const StatBadge: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType }> = ({
    label, value, sub, color = '#6366f1', icon: Icon
}) => (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 hover:bg-white/[0.07] transition-colors">
        <div className="flex items-center gap-1.5 mb-0.5">
            {Icon && <Icon size={13} style={{ color }} />}
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-medium">{label}</span>
        </div>
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {sub && <span className="text-[11px] text-text-muted">{sub}</span>}
    </div>
);

// ─── Legend ──────────────────────────────────────────────────────
const Legend: React.FC<{ data: { label: string; value: number; percentage?: number; color: string }[] }> = ({ data }) => (
    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
        {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-text-muted truncate" title={d.label}>{d.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-bold text-white">{d.value}</span>
                    {d.percentage !== undefined && (
                        <span className="text-text-muted">({d.percentage}%)</span>
                    )}
                </div>
            </div>
        ))}
    </div>
);

// ─── Medicine Table ───────────────────────────────────────────────
const MedicineTable: React.FC<{ items: { srNo: number; medicineName: string; medicineType: string; count: number }[] }> = ({ items }) => {
    if (!items || items.length === 0) {
        return <div className="text-center text-text-muted text-sm italic py-8">No medicines prescribed today</div>;
    }
    return (
        <div className="overflow-auto max-h-80 custom-scrollbar">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider w-12">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider">Medicine Name</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider">Type</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider">Count</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr
                            key={idx}
                            className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${idx === 0 ? 'bg-indigo-500/10' : ''}`}
                        >
                            <td className="px-3 py-2.5 text-text-muted font-mono text-xs">{item.srNo}</td>
                            <td className="px-3 py-2.5 font-medium text-white">{item.medicineName}</td>
                            <td className="px-3 py-2.5">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-text-muted">
                                    {item.medicineType}
                                </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                                <span className="font-bold text-indigo-400">{item.count}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────
export const ClinicalAnalytics: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getTodayAnalytics();
            setData(result);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError(e.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 size={40} className="text-indigo-400 animate-spin" />
                <p className="text-text-muted text-sm">Loading today's analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <AlertCircle size={40} className="text-red-400" />
                <p className="text-red-400 font-medium">{error}</p>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm transition-colors flex items-center gap-2"
                >
                    <RefreshCw size={14} /> Retry
                </button>
            </div>
        );
    }

    const { revenue, patientDemographics, medicineAnalytics } = data || {};

    // Prepare chart data
    const paymentModeChart = (revenue?.paymentModes || []).map((p: any, i: number) => ({
        label: p.mode,
        value: Math.round(p.amount),
        percentage: revenue?.totalRevenue > 0 ? Math.round((p.amount / revenue.totalRevenue) * 100) : 0,
        color: COLORS[i % COLORS.length]
    }));

    const revenueStreamChart = (revenue?.revenueStreams || []).map((p: any, i: number) => ({
        label: p.stream,
        value: p.count,
        percentage: patientDemographics?.totalPatientCount > 0
            ? Math.round((p.count / patientDemographics.totalPatientCount) * 100)
            : 0,
        color: COLORS[(i + 5) % COLORS.length]
    }));

    const genderChart = (patientDemographics?.genderDemographics || []).map((g: any, i: number) => ({
        label: g.gender,
        value: g.count,
        percentage: g.percentage,
        color: g.gender === 'Male' ? '#60a5fa' : g.gender === 'Female' ? '#f472b6' : COLORS[i]
    }));

    const ageChart = (patientDemographics?.ageDemographics || []).map((a: any, i: number) => ({
        label: a.ageGroup,
        value: a.count,
        percentage: a.percentage,
        color: COLORS[i % COLORS.length]
    }));

    const acquisitionChart = (patientDemographics?.acquisitionSources || []).map((a: any, i: number) => ({
        label: a.source,
        value: a.count,
        percentage: a.percentage,
        color: COLORS[(i + 3) % COLORS.length]
    }));

    const medTypeChart = (medicineAnalytics?.medicineTypes || []).map((t: any, i: number) => ({
        label: t.type,
        value: t.count,
        percentage: t.percentage,
        color: COLORS[(i + 2) % COLORS.length]
    }));

    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="space-y-8 animate-in fade-in">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                        <Calendar size={20} className="text-indigo-400" />
                        Today's Clinic Analytics
                    </h2>
                    <p className="text-text-muted text-sm mt-1">{today}</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/30 transition-all text-sm font-medium"
                >
                    <RefreshCw size={14} />
                    Refresh Data
                    <span className="text-[10px] text-indigo-500 ml-1">
                        {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════
                 SECTION 1: REVENUE STATS
             ═══════════════════════════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-green-400 to-emerald-600" />
                    <h3 className="text-base font-bold text-white">1. Revenue Stats</h3>
                </div>

                {/* 1a - Revenue Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    <StatBadge
                        label="Total Revenue"
                        value={`₹${fmt(revenue?.totalRevenue || 0)}`}
                        sub={`From ${revenue?.paymentModes?.reduce((s: number, p: any) => s + (p.amount > 0 ? 1 : 0), 0) || 0} payment method(s)`}
                        color="#10b981"
                        icon={DollarSign}
                    />
                    <StatBadge
                        label="Avg Transaction"
                        value={`₹${fmt(revenue?.avgTransaction || 0)}`}
                        sub="Per patient billing"
                        color="#6366f1"
                        icon={TrendingUp}
                    />
                    <StatBadge
                        label="Total Discount"
                        value={`₹${fmt(revenue?.totalDiscount || 0)}`}
                        sub="Applied discounts today"
                        color="#f59e0b"
                        icon={Activity}
                    />
                </div>

                {/* 1b - Payment Mode + Revenue Stream Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <SectionCard title="Payment Mode" icon={DollarSign} color="#10b981">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <DonutChart data={paymentModeChart} size={160} />
                            <div className="flex-1 w-full">
                                <Legend data={paymentModeChart} />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Revenue Stream" icon={TrendingUp} color="#6366f1">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <DonutChart data={revenueStreamChart} size={160} />
                            <div className="flex-1 w-full">
                                <Legend data={revenueStreamChart} />
                            </div>
                        </div>
                    </SectionCard>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                 SECTION 2: PATIENT DEMOGRAPHICS
             ═══════════════════════════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-400 to-indigo-600" />
                    <h3 className="text-base font-bold text-white">2. Patient Demographics</h3>
                </div>

                {/* 2a - Patient Count Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    <StatBadge
                        label="Total Patients Today"
                        value={patientDemographics?.totalPatientCount || 0}
                        sub="Visited today"
                        color="#6366f1"
                        icon={Users}
                    />
                    <StatBadge
                        label="New Patients"
                        value={patientDemographics?.newPatientCount || 0}
                        sub="Registered today"
                        color="#22d3ee"
                        icon={Users}
                    />
                    <StatBadge
                        label="Old Patients"
                        value={patientDemographics?.oldPatientCount || 0}
                        sub="Revisiting patients"
                        color="#a78bfa"
                        icon={Users}
                    />
                </div>

                {/* 2b - Gender + Age Demographics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    <SectionCard title="Gender Demographics" icon={Users} color="#60a5fa">
                        <BarChart
                            data={genderChart.map((g: any) => ({ label: g.label, value: g.value, percentage: g.percentage, color: g.color }))}
                            showPercentage={true}
                            colorful={true}
                        />
                    </SectionCard>

                    <SectionCard title="Age Demographics" icon={BarChart2} color="#a78bfa">
                        <BarChart
                            data={ageChart.map((a: any) => ({ label: a.label, value: a.value, percentage: a.percentage, color: a.color }))}
                            showPercentage={true}
                            colorful={true}
                        />
                    </SectionCard>
                </div>

                {/* 2c - Purpose of Visit + Patient Acquisition */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    <SectionCard title="Purpose of Visit" icon={Activity} color="#f59e0b">
                        <BarChart
                            data={(patientDemographics?.purposeOfVisit || []).map((p: any) => ({
                                label: p.purpose,
                                value: p.count,
                                color: COLORS[0]
                            }))}
                            colorful={true}
                        />
                    </SectionCard>

                    <SectionCard title="Patient Acquisition Source" icon={PieChart} color="#f43f5e">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <DonutChart data={acquisitionChart} size={160} />
                            <div className="flex-1 w-full">
                                <Legend data={acquisitionChart} />
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* 2d - Geographic Reach */}
                <SectionCard title="Geographic Reach (State-wise)" icon={MapPin} color="#34d399">
                    {(patientDemographics?.geographicReach || []).length === 0 ? (
                        <div className="text-center text-text-muted text-sm italic py-4">No geographic data available</div>
                    ) : (
                        <BarChart
                            data={(patientDemographics?.geographicReach || []).map((g: any) => ({
                                label: g.location,
                                value: g.count,
                                percentage: g.percentage
                            }))}
                            showPercentage={true}
                            colorful={true}
                        />
                    )}
                </SectionCard>
            </div>

            {/* ═══════════════════════════════════════════════════════
                 SECTION 3: MEDICINE ANALYTICS
             ═══════════════════════════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-purple-400 to-pink-600" />
                    <h3 className="text-base font-bold text-white">3. Medicine Analytics</h3>
                </div>

                {/* 3a - Total Prescribed + Medicine Types */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                    <StatBadge
                        label="Total Medicines Prescribed"
                        value={medicineAnalytics?.totalMedicinePrescribed || 0}
                        sub="Prescriptions issued today"
                        color="#a78bfa"
                        icon={Pill}
                    />
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5" style={{ background: '#a78bfa18' }}>
                            <div className="p-1.5 rounded-lg" style={{ background: '#a78bfa30' }}>
                                <PieChart size={16} style={{ color: '#a78bfa' }} />
                            </div>
                            <h3 className="text-sm font-bold text-white tracking-wide">Medicine Type Breakdown</h3>
                        </div>
                        <div className="p-5">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <DonutChart data={medTypeChart} size={140} />
                                <div className="flex-1 w-full">
                                    <Legend data={medTypeChart} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3b - Top 10 Medicines Bar Chart */}
                <SectionCard title="Top 10 Medicines Prescribed Today" icon={BarChart2} color="#f43f5e" className="mb-5">
                    {(medicineAnalytics?.top10Medicines || []).length === 0 ? (
                        <div className="text-center text-text-muted text-sm italic py-4">No prescriptions today</div>
                    ) : (
                        <BarChart
                            data={(medicineAnalytics?.top10Medicines || []).map((m: any, i: number) => ({
                                label: m.name,
                                value: m.count,
                                percentage: m.percentage,
                                color: COLORS[i % COLORS.length]
                            }))}
                            showPercentage={true}
                            colorful={true}
                        />
                    )}
                </SectionCard>

                {/* 3c - Today's Prescribed Medicine List */}
                <SectionCard title="Today's Prescribed Medicine List" icon={Pill} color="#22d3ee">
                    <MedicineTable items={medicineAnalytics?.todayMedicineList || []} />
                </SectionCard>
            </div>

        </div>
    );
};

export default ClinicalAnalytics;
