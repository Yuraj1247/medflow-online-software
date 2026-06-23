import React, { useState, useEffect } from 'react';
import { getOverallAnalytics } from '../services/storage';
import {
    TrendingUp, Users, Pill, RefreshCw, DollarSign, Activity,
    MapPin, BarChart2, PieChart, AlertCircle, Loader2
} from 'lucide-react';

// ─── Shared Utilities ─────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

const COLORS = [
    '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
    '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9',
    '#fbbf24', '#2dd4bf', '#818cf8', '#4ade80', '#f87171'
];

// ─── Donut Chart ──────────────────────────────────────────────────
const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 160 }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return (
        <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
            <PieChart size={32} className="text-text-muted opacity-30" />
            <span className="text-xs text-text-muted mt-1">No data</span>
        </div>
    );
    let cumulative = 0;
    const r = (size / 2) - 16; const cx = size / 2; const cy = size / 2;
    const circ = 2 * Math.PI * r;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="28" />
            {data.map((d, i) => {
                const pct = d.value / total;
                const offset = circ - cumulative * circ;
                const dash = `${pct * circ} ${(1 - pct) * circ}`;
                cumulative += pct;
                return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="28" strokeDasharray={dash} strokeDashoffset={offset} strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />;
            })}
            <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">Total</text>
        </svg>
    );
};

// ─── Bar Chart ────────────────────────────────────────────────────
const ABar: React.FC<{ data: { label: string; value: number; percentage?: number }[]; showPct?: boolean; colorful?: boolean }> = ({ data, showPct, colorful }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    if (!data.length) return <div className="text-center text-text-muted text-sm italic py-6">No data</div>;
    return (
        <div className="space-y-2.5">
            {data.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-text-muted w-28 truncate flex-shrink-0" title={d.label}>{d.label}</span>
                    <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(d.value / max) * 100}%`, background: colorful ? `${COLORS[i % COLORS.length]}cc` : 'linear-gradient(90deg,#6366f1cc,#818cf8cc)', transition: 'width 0.8s ease', minWidth: d.value > 0 ? '4px' : '0' }} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 w-20 justify-end">
                        <span className="text-xs font-bold text-white">{d.value}</span>
                        {showPct && d.percentage !== undefined && <span className="text-xs text-text-muted">({d.percentage}%)</span>}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Stat Badge ───────────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType }> = ({ label, value, sub, color = '#6366f1', icon: Icon }) => (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 hover:bg-white/[0.07] transition-colors">
        <div className="flex items-center gap-1.5 mb-0.5">
            {Icon && <Icon size={13} style={{ color }} />}
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-medium">{label}</span>
        </div>
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {sub && <span className="text-[11px] text-text-muted">{sub}</span>}
    </div>
);

// ─── Section Card ─────────────────────────────────────────────────
const Section: React.FC<{ title: string; icon: React.ElementType; color: string; children: React.ReactNode; className?: string }> = ({ title, icon: Icon, color, children, className = '' }) => (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden ${className}`}>
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5" style={{ background: `${color}18` }}>
            <div className="p-1.5 rounded-lg" style={{ background: `${color}30` }}><Icon size={16} style={{ color }} /></div>
            <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ─── Legend ───────────────────────────────────────────────────────
const ALegend: React.FC<{ data: { label: string; value: number; percentage?: number; color: string }[] }> = ({ data }) => (
    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
        {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-text-muted truncate">{d.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-bold text-white">{d.value}</span>
                    {d.percentage !== undefined && <span className="text-text-muted">({d.percentage}%)</span>}
                </div>
            </div>
        ))}
    </div>
);

// ─── Medicine Table ───────────────────────────────────────────────
const MedTable: React.FC<{ items: any[] }> = ({ items }) => {
    if (!items?.length) return <div className="text-center text-text-muted text-sm italic py-8">No medicines prescribed</div>;
    return (
        <div className="overflow-auto max-h-80 custom-scrollbar">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase w-12">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Medicine Name</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Type</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Count</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx} className={`border-b border-white/5 hover:bg-white/[0.04] transition-colors ${idx === 0 ? 'bg-indigo-500/10' : ''}`}>
                            <td className="px-3 py-2.5 text-text-muted font-mono text-xs">{item.srNo}</td>
                            <td className="px-3 py-2.5 font-medium text-white">{item.medicineName}</td>
                            <td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-text-muted">{item.medicineType}</span></td>
                            <td className="px-3 py-2.5 text-right font-bold text-indigo-400">{item.count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ─── Revenue Section ──────────────────────────────────────────────
const RevenueSection: React.FC<{ d: any }> = ({ d }) => {
    const rev = d?.revenue || {};
    const total = rev.totalPatientForStream || 0;
    const payChart = (rev.paymentModes || []).map((p: any, i: number) => ({ label: p.mode, value: Math.round(p.amount), percentage: rev.totalRevenue > 0 ? Math.round((p.amount / rev.totalRevenue) * 100) : 0, color: COLORS[i % COLORS.length] }));
    const streamChart = (rev.revenueStreams || []).map((p: any, i: number) => ({ label: p.stream, value: p.count, percentage: 0, color: COLORS[(i + 5) % COLORS.length] }));
    const streamTotal = streamChart.reduce((s: number, x: any) => s + x.value, 0);
    streamChart.forEach((x: any) => { x.percentage = streamTotal > 0 ? Math.round((x.value / streamTotal) * 100) : 0; });

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label="Total Revenue" value={`₹${fmt(rev.totalRevenue || 0)}`} sub="All-time collections" color="#10b981" icon={DollarSign} />
                <Stat label="Avg Transaction" value={`₹${fmt(rev.avgTransaction || 0)}`} sub="Per patient billing" color="#6366f1" icon={TrendingUp} />
                <Stat label="Total Discount" value={`₹${fmt(rev.totalDiscount || 0)}`} sub="All-time discounts applied" color="#f59e0b" icon={Activity} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Section title="Payment Mode" icon={DollarSign} color="#10b981">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <DonutChart data={payChart} size={160} />
                        <div className="flex-1 w-full"><ALegend data={payChart} /></div>
                    </div>
                </Section>
                <Section title="Revenue Stream (Payment Source)" icon={TrendingUp} color="#6366f1">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <DonutChart data={streamChart} size={160} />
                        <div className="flex-1 w-full"><ALegend data={streamChart} /></div>
                    </div>
                </Section>
            </div>
        </div>
    );
};

// ─── Patient Section ──────────────────────────────────────────────
const PatientSection: React.FC<{ d: any }> = ({ d }) => {
    const pd = d?.patientDemographics || {};
    const total = pd.totalPatientCount || 0;
    const genderChart = (pd.genderDemographics || []).map((g: any, i: number) => ({ label: g.gender, value: g.count, percentage: g.percentage, color: g.gender === 'Male' ? '#60a5fa' : g.gender === 'Female' ? '#f472b6' : COLORS[i] }));
    const ageChart = (pd.ageDemographics || []).map((a: any, i: number) => ({ label: a.ageGroup, value: a.count, percentage: a.percentage, color: COLORS[i % COLORS.length] }));
    const acqChart = (pd.acquisitionSources || []).map((a: any, i: number) => ({ label: a.source, value: a.count, percentage: a.percentage, color: COLORS[(i + 3) % COLORS.length] }));

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label="Total Patients" value={total} sub="All-time registered" color="#6366f1" icon={Users} />
                <Stat label="New Patients" value={pd.newPatientCount || 0} sub="First-time registrations" color="#22d3ee" icon={Users} />
                <Stat label="Old / Returning" value={pd.oldPatientCount || 0} sub="Revisiting patients" color="#a78bfa" icon={Users} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Section title="Gender Demographics" icon={Users} color="#60a5fa">
                    <ABar data={genderChart} showPct colorful />
                </Section>
                <Section title="Age Demographics" icon={BarChart2} color="#a78bfa">
                    <ABar data={ageChart} showPct colorful />
                </Section>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Section title="Purpose of Visit" icon={Activity} color="#f59e0b">
                    <ABar data={(pd.purposeOfVisit || []).map((p: any) => ({ label: p.purpose, value: p.count }))} colorful />
                </Section>
                <Section title="Patient Acquisition Source" icon={PieChart} color="#f43f5e">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <DonutChart data={acqChart} size={160} />
                        <div className="flex-1 w-full"><ALegend data={acqChart} /></div>
                    </div>
                </Section>
            </div>
            <Section title="Geographic Reach (State-wise)" icon={MapPin} color="#34d399">
                <ABar data={(pd.geographicReach || []).map((g: any) => ({ label: g.location, value: g.count, percentage: g.percentage }))} showPct colorful />
            </Section>
        </div>
    );
};

// ─── Medicine Section ─────────────────────────────────────────────
const MedicineSection: React.FC<{ d: any }> = ({ d }) => {
    const ma = d?.medicineAnalytics || {};
    const total = ma.totalMedicinePrescribed || 0;
    const typeChart = (ma.medicineTypes || []).map((t: any, i: number) => ({ label: t.type, value: t.count, percentage: t.percentage, color: COLORS[(i + 2) % COLORS.length] }));

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Stat label="Total Medicines Prescribed" value={total} sub="All-time prescriptions issued" color="#a78bfa" icon={Pill} />
                <Section title="Medicine Type Breakdown" icon={PieChart} color="#a78bfa">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <DonutChart data={typeChart} size={140} />
                        <div className="flex-1 w-full"><ALegend data={typeChart} /></div>
                    </div>
                </Section>
            </div>
            <Section title="Top 10 Medicines Prescribed (All Time)" icon={BarChart2} color="#f43f5e">
                <ABar data={(ma.top10Medicines || []).map((m: any) => ({ label: m.name, value: m.count, percentage: m.percentage }))} showPct colorful />
            </Section>
            <Section title="All Prescribed Medicines List" icon={Pill} color="#22d3ee">
                <MedTable items={ma.todayMedicineList || []} />
            </Section>
        </div>
    );
};

// ─── Main Export ──────────────────────────────────────────────────
export const OverallAnalytics: React.FC<{
    section: 'revenue' | 'patient' | 'medicine';
    startDate?: string;
    endDate?: string;
}> = ({ section, startDate, endDate }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        setLoading(true);
        getOverallAnalytics(startDate, endDate)
            .then(d => { setData(d); })
            .catch(e => setError(e.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [startDate, endDate]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 size={40} className="text-indigo-400 animate-spin" />
            <p className="text-text-muted text-sm">Loading analytics...</p>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <AlertCircle size={40} className="text-red-400" />
            <p className="text-red-400">{error}</p>
            <button onClick={() => { setLoading(true); setError(''); getOverallAnalytics(startDate, endDate).then(d => { setData(d); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm flex items-center gap-2">
                <RefreshCw size={14} /> Retry
            </button>
        </div>
    );

    if (section === 'revenue') return <RevenueSection d={data} />;
    if (section === 'patient') return <PatientSection d={data} />;
    if (section === 'medicine') return <MedicineSection d={data} />;
    return null;
};
