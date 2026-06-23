import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Input } from '../components/UI';
import { Patient, Bill, PrescriptionRecord, User, UserRole } from '../types';
import { getPatients, formatDate, getBills, getAllVisits, getPatientByUHID, getPatientHistory, getStoredAuth, getUsers, getDoctorPreferences, getDoctorPageSettings } from '../services/storage';
import { MessageSquare, RefreshCw, Send, User as UserIcon, Calendar, Activity, CreditCard, Pill } from 'lucide-react';
import { formatRegistrationMessage, formatPrescriptionMessage, formatBillingMessage, sendWhatsAppMessage } from '../services/whatsapp';
import { useMasterData } from '../MasterContext';

interface WhatsappMessagingProps {
    user: User;
}

export const WhatsappMessaging: React.FC<WhatsappMessagingProps> = ({ user }) => {
    const { masterData } = useMasterData();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [patients, setPatients] = useState<any[]>([]);
    const [bills, setBills] = useState<Bill[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const ordinals = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const formatPrintDate = (isoDate: string | undefined): string => {
        if (!isoDate) return '';
        const parts = isoDate.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
        }
        return isoDate;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [v, b, p, u] = await Promise.all([
                getAllVisits(),
                getBills(),
                getPatients(),
                getUsers()
            ]);
            
            setBills(b);
            setAllUsers(u);
            
            // Filter by date and doctor
            let todayVisits = v.filter((visit: any) => visit.visitDate === selectedDate);
            
            if (user.role === UserRole.DOCTOR) {
                const cleanDoctorName = user.name.toLowerCase().replace(/^dr\.?\s+/, '');
                todayVisits = todayVisits.filter((visit: any) => {
                    const cleanConsultantName = visit.consultantName.toLowerCase().replace(/^dr\.?\s+/, '');
                    return cleanConsultantName === cleanDoctorName;
                });
            }

            // JOIN check for Prescription or Bill
            const displayPatients = todayVisits.filter((visit: any) => {
                const hasPrescription = visit.prescriptionCount > 0;
                const hasBill = b.some(bill => bill.uhid === visit.uhid && bill.visitCount === visit.visitCount);
                return hasPrescription || hasBill;
            }).map((visit: any) => {
                const pat = p.find(pt => pt.uhid === visit.uhid);
                const bil = b.find(bill => bill.uhid === visit.uhid && bill.visitCount === visit.visitCount);
                return {
                    ...visit,
                    patient: pat,
                    bill: bil,
                    hasPrescription: visit.prescriptionCount > 0
                };
            });

            setPatients(displayPatients);
        } catch (error) {
            console.error("Failed to load messaging data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const handleSendRegistration = (row: any) => {
        const pat = row.patient || row;
        const msg = formatRegistrationMessage({
            patientTitle: row.title,
            patientName: `${row.firstName} ${row.lastName}`,
            uhid: row.uhid,
            age: row.age,
            sex: row.sex,
            mobile: row.mobile,
            address: row.address,
            clinicName: masterData?.clinicName || 'Clinic',
            doctorName: row.consultantName,
            doctorDesignation: 'Consultant',
            visitDate: formatPrintDate(row.visitDate),
            visitNo: ordinals(row.visitCount) + " Visit",
            purpose: row.purposeOfVisit || 'Consultation'
        });
        sendWhatsAppMessage(row.mobile, msg);
    };

    const handleSendPrescription = async (row: any) => {
        try {
            const history = await getPatientHistory(row.uhid);
            const visit = history.find(h => h.visitCount === row.visitCount);
            if (!visit) {
                alert("Prescription data not found for this visit.");
                return;
            }

            const consultant = allUsers.find(u => u.name === row.consultantName);
            let designation = 'Consultant';
            if (consultant) {
                const prefs = await getDoctorPreferences(consultant.id);
                // We'd ideally store designation in user or master data, default to Consultant
            }

            const medicineList = visit.data.prescriptions
                .map(m => `• ${m.type}. ${m.medicineName} (${m.dosage}) - ${m.days} Days${m.instruction ? `\n   Instruction: ${m.instruction}` : ''}`)
                .join('\n\n');

            const msg = formatPrescriptionMessage({
                patientTitle: row.title,
                patientName: `${row.firstName} ${row.lastName}`,
                clinicName: masterData?.clinicName || 'Clinic',
                uhid: row.uhid,
                age: row.age,
                sex: row.sex,
                mobile: row.mobile,
                address: row.address,
                doctorName: row.consultantName,
                doctorDesignation: designation,
                visitNo: ordinals(row.visitCount) + " Visit",
                medicineList: medicineList || 'Consultation only'
            });
            sendWhatsAppMessage(row.mobile, msg);
        } catch (error) {
            console.error(error);
            alert("Error preparing prescription message.");
        }
    };

    const handleSendBilling = (row: any) => {
        if (!row.bill) {
            alert("Billing data not found for this visit.");
            return;
        }
        
        const subTotal = row.bill.total;
        // Simple mock of calculateFinals logic if not available as import
        const discountVal = row.bill.discountValue || 0;
        let discountAmount = 0;
        if (row.bill.discountType === 'Percentage') {
            discountAmount = (subTotal * Math.min(discountVal, 100)) / 100;
        } else {
            discountAmount = Math.min(discountVal, subTotal);
        }
        const taxable = subTotal - discountAmount;
        const tax = masterData?.enableGst ? taxable * ((masterData.gstRate || 18) / 100) : 0;
        const netTotal = taxable + tax;

        const itemsStr = row.bill.items.map((it: any, idx: number) =>
            `${idx + 1}. ${it.particulars}  ₹${it.amount.toFixed(2)}`
        ).join('\n');

        const msg = formatBillingMessage({
            patientTitle: row.title,
            patientName: `${row.firstName} ${row.lastName}`,
            clinicName: masterData?.clinicName || 'Clinic',
            uhid: row.uhid,
            age: row.age,
            sex: row.sex,
            mobile: row.mobile,
            address: row.address,
            consultantName: row.consultantName,
            visitNo: ordinals(row.visitCount) + " Visit",
            paymentBy: row.patient?.paymentBy || 'Self',
            paymentMode: row.bill.paymentMode || 'CASH',
            billItems: itemsStr,
            subTotal: subTotal.toFixed(2),
            netTotal: netTotal.toFixed(2),
            invoiceNo: row.bill.billNo,
            date: formatPrintDate(row.bill.date)
        });
        sendWhatsAppMessage(row.mobile, msg);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-white flex items-center gap-3">
                        <div className="bg-green-600/20 p-2 rounded-lg"><MessageSquare className="text-green-500" size={24} /></div>
                        WhatsApp Messaging
                    </h1>
                    <p className="text-text-muted text-sm mt-1">Send registration, prescription, and billing details to patients.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="w-44">
                        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-primary/10 border-primary/20" />
                    </div>
                    <Button variant="secondary" onClick={loadData} className="flex items-center gap-2">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden border-border bg-card/30 backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-primary/10 border-b border-border text-[10px] uppercase font-bold text-white tracking-widest">
                                <th className="px-6 py-4">UHID</th>
                                <th className="px-6 py-4">Patient Name</th>
                                <th className="px-6 py-4">Contact</th>
                                <th className="px-6 py-4">Visit Info</th>
                                <th className="px-6 py-4 text-center">Quick Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : patients.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-text-muted italic">
                                        No patients with prescriptions or bills found for this date.
                                    </td>
                                </tr>
                            ) : patients.map((row) => (
                                <tr key={`${row.uhid}-${row.visitCount}`} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <span className="font-mono text-primary font-bold text-sm">{row.uhid}</span>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-white font-bold text-base">{row.title} {row.firstName} {row.lastName}</span>
                                            <span className="text-text-muted text-xs uppercase tracking-tighter">{row.age}Y • {row.sex}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap text-text-muted text-sm font-medium">
                                        {row.mobile}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-primary px-2 py-0.5 rounded-full text-[10px] text-white font-bold">{ordinals(row.visitCount)} Visit</span>
                                                {row.hasPrescription && <div className="bg-blue-500/10 text-blue-400 p-1 rounded-md" title="Prescription Done"><Pill size={12} /></div>}
                                                {row.bill && <div className="bg-yellow-500/10 text-yellow-500 p-1 rounded-md" title="Billing Done"><CreditCard size={12} /></div>}
                                            </div>
                                            <span className="text-text-muted text-[10px] font-medium">{row.consultantName}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => handleSendRegistration(row)}
                                                className="group flex items-center justify-center p-2.5 rounded-xl bg-primary/20 text-primary hover:bg-primary hover:text-white transition-all duration-200 border border-primary/20"
                                                title="Registration Message"
                                            >
                                                <UserIcon size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleSendPrescription(row)}
                                                disabled={!row.hasPrescription}
                                                className={`group flex items-center justify-center p-2.5 rounded-xl transition-all duration-200 border ${row.hasPrescription ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border-blue-600/20' : 'bg-gray-800/20 text-gray-600 border-gray-800/20 cursor-not-allowed'}`}
                                                title="Prescription Message"
                                            >
                                                <Pill size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleSendBilling(row)}
                                                disabled={!row.bill}
                                                className={`group flex items-center justify-center p-2.5 rounded-xl transition-all duration-200 border ${row.bill ? 'bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white border-orange-600/20' : 'bg-gray-800/20 text-gray-600 border-gray-800/20 cursor-not-allowed'}`}
                                                title="Billing Message"
                                            >
                                                <CreditCard size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
