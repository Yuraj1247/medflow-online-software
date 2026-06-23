import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Input } from '../components/UI';
import { User, UserRole } from '../types';
import { getAllVisits, getStoredAuth } from '../services/storage';
import { Calendar, RefreshCw, MessageSquare } from 'lucide-react';
import { sendWhatsAppMessage } from '../services/whatsapp';
import { useMasterData } from '../MasterContext';

export const FollowUp: React.FC = () => {
    const { masterData } = useMasterData();
    const [loading, setLoading] = useState(true);
    const [allVisits, setAllVisits] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMode, setFilterMode] = useState<'upcoming' | 'slider' | 'custom'>('upcoming');
    const [sliderValue, setSliderValue] = useState(7);
    
    // Timezone-safe local date calculation
    const getLocalTodayString = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [customDate, setCustomDate] = useState(getLocalTodayString());

    const todayStr = useMemo(() => getLocalTodayString(), []);

    // Helper to add days to a local date string (YYYY-MM-DD)
    const addDays = (dateStr: string, days: number): string => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Slider target date: target date is sliderValue days from today.
    const targetSliderDate = useMemo(() => {
        return addDays(todayStr, sliderValue);
    }, [todayStr, sliderValue]);

    const formatDisplayDate = (dateStr: string | undefined): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    };

    const ordinals = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const visits = await getAllVisits();
            setAllVisits(visits);
        } catch (error) {
            console.error("Failed to load follow-up data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filter and Process Visits
    const followUpData = useMemo(() => {
        const user = getStoredAuth();
        if (!user) return [];

        let filtered = allVisits;

        // 1. Role-based filtering: Doctors only see their own patients
        if (user.role === UserRole.DOCTOR) {
            const cleanDoctorName = user.name.toLowerCase().replace(/^dr\.?\s+/, '');
            filtered = filtered.filter((v: any) => {
                const cleanConsultant = (v.consultantName || '').toLowerCase().replace(/^dr\.?\s+/, '');
                return cleanConsultant === cleanDoctorName;
            });
        }

        // 2. Filter visits that actually have a follow-up date
        let hasFollowUp = filtered.filter((v: any) => v.nextVisitDate && v.nextVisitDate.trim() !== '');

        // 3. Filter based on Selected Mode
        if (filterMode === 'upcoming') {
            hasFollowUp = hasFollowUp.filter((v: any) => v.nextVisitDate >= todayStr);
        } else if (filterMode === 'slider') {
            hasFollowUp = hasFollowUp.filter((v: any) => v.nextVisitDate === targetSliderDate);
        } else if (filterMode === 'custom') {
            hasFollowUp = hasFollowUp.filter((v: any) => v.nextVisitDate === customDate);
        }

        // 4. Filter by Search Query (Name/UHID) if provided
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            hasFollowUp = hasFollowUp.filter((v: any) => {
                const fullName = `${v.title} ${v.firstName} ${v.lastName}`.toLowerCase();
                const uhid = (v.uhid || '').toLowerCase();
                return fullName.includes(q) || uhid.includes(q);
            });
        }

        // 5. Sort by follow-up date ascending (closest follow-ups first)
        return hasFollowUp.sort((a: any, b: any) => a.nextVisitDate.localeCompare(b.nextVisitDate));
    }, [allVisits, filterMode, targetSliderDate, customDate, searchQuery, todayStr]);

    const handleSendReminder = (row: any) => {
        const patientName = `${row.title} ${row.firstName} ${row.lastName}`;
        const clinicName = masterData?.clinicName || 'MEDFLOW HOSPITAL';
        const formattedFollowUpDate = formatDisplayDate(row.nextVisitDate);
        const doctorName = (row.consultantName || '').replace(/^dr\.?\s+/i, '');

        const message = `🏥 Follow-Up Appointment Reminder

Dear ${patientName},

Greetings from ${clinicName}.

This is a friendly reminder that your follow-up consultation with Dr. ${doctorName} is scheduled for:

📅 Date: ${formattedFollowUpDate}

Regular follow-up visits are important to monitor your progress and ensure the effectiveness of your treatment.

If you are unable to attend, please contact us to reschedule your appointment.

Thank you for choosing ${clinicName}.

Warm Regards,
${clinicName}`;

        sendWhatsAppMessage(row.mobile, message);
    };

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-white flex items-center gap-3">
                        <div className="bg-primary/20 p-2 rounded-lg">
                            <Calendar className="text-primary" size={24} />
                        </div>
                        Patient Follow Ups
                    </h1>
                    <p className="text-text-muted text-sm mt-1">
                        Track upcoming appointments and send reminders to patients scheduled for follow-ups.
                    </p>
                </div>
                <div className="flex gap-3 items-center">
                    <Button variant="secondary" onClick={loadData} className="flex items-center gap-2">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
                    </Button>
                </div>
            </div>

            {/* Filter controls */}
            <Card className="border-border bg-card/30 backdrop-blur-sm p-4 space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-border/30 pb-4">
                    {/* Filter Mode Selector */}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={filterMode === 'upcoming' ? 'primary' : 'secondary'}
                            onClick={() => setFilterMode('upcoming')}
                            className="text-xs font-semibold"
                        >
                            All Upcoming (From Today)
                        </Button>
                        <Button
                            variant={filterMode === 'slider' ? 'primary' : 'secondary'}
                            onClick={() => setFilterMode('slider')}
                            className="text-xs font-semibold"
                        >
                            Filter by Days (Slider)
                        </Button>
                        <Button
                            variant={filterMode === 'custom' ? 'primary' : 'secondary'}
                            onClick={() => setFilterMode('custom')}
                            className="text-xs font-semibold"
                        >
                            Filter by Custom Date
                        </Button>
                    </div>

                    {/* Active Filter Helper text */}
                    <div className="text-xs text-text-muted font-medium bg-background/30 px-3 py-1.5 rounded-lg border border-border/30">
                        {filterMode === 'upcoming' && (
                            <span>Showing all upcoming follow-ups starting from today (<strong>{formatDisplayDate(todayStr)}</strong>).</span>
                        )}
                        {filterMode === 'slider' && (
                            <span>Showing follow-ups on the <strong>{ordinals(sliderValue)} day</strong>: <strong>{formatDisplayDate(targetSliderDate)}</strong>.</span>
                        )}
                        {filterMode === 'custom' && (
                            <span>Showing follow-ups on: <strong>{formatDisplayDate(customDate)}</strong>.</span>
                        )}
                    </div>
                </div>

                {/* Sub-panels for active filters */}
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    {filterMode === 'slider' && (
                        <div className="bg-background/40 p-4 rounded-xl border border-border/50 space-y-2 flex-1 max-w-xl">
                            <div className="flex justify-between text-xs text-text-muted font-bold">
                                <span>1 Day (Tomorrow)</span>
                                <span className="text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                    Slider: {sliderValue} Day{sliderValue > 1 ? 's' : ''} (Follow Up in {sliderValue} Day{sliderValue > 1 ? 's' : ''})
                                </span>
                                <span>30 Days</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="30"
                                value={sliderValue}
                                onChange={(e) => setSliderValue(parseInt(e.target.value))}
                                className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary border border-border"
                            />
                            <div className="text-[11px] text-text-muted text-center italic mt-1">
                                Target Follow-up Date: <span className="text-white font-semibold not-italic">{formatDisplayDate(targetSliderDate)}</span>
                            </div>
                        </div>
                    )}

                    {filterMode === 'custom' && (
                        <div className="bg-background/40 p-4 rounded-xl border border-border/50 w-full md:w-72">
                            <Input
                                label="Enter Custom Date"
                                type="date"
                                value={customDate}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="bg-background border-border"
                            />
                        </div>
                    )}

                    {/* Live search input filter */}
                    <div className="w-full md:w-72 md:ml-auto">
                        <Input
                            placeholder="Search by name or UHID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-background border-border"
                            error=""
                        />
                    </div>
                </div>
            </Card>

            {/* Patients table */}
            <Card className="overflow-hidden border-border bg-card/30 backdrop-blur-sm p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-primary/10 border-b border-border text-[10px] uppercase font-bold text-white tracking-widest">
                                <th className="px-5 py-4 text-center w-16">Sr.</th>
                                <th className="px-5 py-4">UHID</th>
                                <th className="px-5 py-4">Patient Name</th>
                                <th className="px-5 py-4 text-center">Visit No</th>
                                <th className="px-5 py-4 text-center">Age / Sex</th>
                                <th className="px-5 py-4">Mobile</th>
                                <th className="px-5 py-4">Location</th>
                                <th className="px-5 py-4">Visit Date</th>
                                <th className="px-5 py-4">Follow Up Date</th>
                                <th className="px-5 py-4">Consultant</th>
                                <th className="px-5 py-4 text-center w-24">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 text-sm">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={11} className="px-5 py-7">
                                            <div className="h-4 bg-white/5 rounded w-full"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : followUpData.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-5 py-16 text-center text-text-muted italic">
                                        No patients scheduled for follow-up in this selection.
                                    </td>
                                </tr>
                            ) : (
                                followUpData.map((row, index) => {
                                    const locationStr = [row.city, row.state].filter(Boolean).join(', ') || row.address || '-';
                                    return (
                                        <tr key={`${row.uhid}-${row.visitCount}`} className="hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-4 text-center text-text-muted font-medium">{index + 1}</td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-mono text-primary font-bold">{row.uhid}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-bold text-white">
                                                {row.title} {row.firstName} {row.lastName}
                                            </td>
                                            <td className="px-5 py-4 text-center whitespace-nowrap">
                                                <span className="bg-background px-2.5 py-0.5 rounded-full text-xs font-semibold border border-border/30">
                                                    {ordinals(row.visitCount)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center whitespace-nowrap font-medium text-text-muted">
                                                {row.age} Y / {row.sex}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-mono text-text-muted">
                                                {row.mobile}
                                            </td>
                                            <td className="px-5 py-4 truncate max-w-[150px] text-text-muted" title={locationStr}>
                                                {locationStr}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-mono text-text-muted text-xs">
                                                {formatDisplayDate(row.visitDate)}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-mono text-primary font-bold text-xs">
                                                {formatDisplayDate(row.nextVisitDate)}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-xs text-text-muted font-medium">
                                                {row.consultantName}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    onClick={() => handleSendReminder(row)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                                                >
                                                    <MessageSquare size={13} />
                                                    Follow Up
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
