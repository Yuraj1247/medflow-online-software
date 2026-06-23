import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Table } from '../components/UI';
import { Patient, PrescriptionRecord, User } from '../types';
import { getPatients, formatDate, getPatientHistory, getPatientByUHID, getAllVisits } from '../services/storage';
import { ClipboardList, Stethoscope, Printer, Eye, Activity, Clock, MessageSquare, Edit3 } from 'lucide-react';
import { PrescriptionModal } from './PrescriptionModal';
import { WhatsappMessaging } from './WhatsappMessaging';
import { cn } from '../components/UI';

interface PrescribeProps {
  user: User;
}

interface VisitRow {
  visitId: number;
  uhid: string;
  visitDate: string;
  visitCount: number;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  age: number;
  sex: string;
  mobile: string;
  address: string;
  state?: string;
  city?: string;
  taluka?: string;
  userType: string;
  consultantName: string;
  referredBy?: string;
  paymentBy?: string;
  registrationDate: string;
  email?: string;
  idProofType?: string;
  idProofNumber?: string;
  purposeOfVisit?: string;
  birthDate?: string;
  totalVisits: number;
  prescriptionCount: number;
}

export const Prescribe: React.FC<PrescribeProps> = ({ user }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [filteredVisits, setFilteredVisits] = useState<VisitRow[]>([]);

  // History Selection State
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);

  // Modal State
  const [isPrescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);

  // For viewing history record
  const [viewOnlyRecord, setViewOnlyRecord] = useState<PrescriptionRecord | undefined>(undefined);
  const [mainTab, setMainTab] = useState<'prescribe' | 'whatsapp'>('prescribe');

  useEffect(() => {
    // Load data
    const loadData = async () => {
      const all = await getAllVisits();
      setVisits(all);

      // If we have a selected patient for history, refresh their data
      if (historyPatient) {
        const history = await getPatientHistory(historyPatient.uhid);
        setHistoryPatient(prev => prev ? { ...prev, prescriptionHistory: history } : null);
      }
    };
    loadData();
  }, [isPrescriptionModalOpen, selectedDate]); // Refresh when modal closes or date changes

  // Filter Visits by Date AND Consultant
  useEffect(() => {
    if (visits.length > 0) {
      const filtered = visits.filter(v => v.visitDate === selectedDate && v.consultantName === user.name);
      setFilteredVisits(filtered);
    } else {
      setFilteredVisits([]);
    }
  }, [selectedDate, visits, user]);

  const handlePatientSelect = async (patient: Patient) => {
    // Fetch History On-Demand
    const history = await getPatientHistory(patient.uhid);
    setHistoryPatient({ ...patient, prescriptionHistory: history });
  };

  const openPrescribeModal = async (patient: Patient) => {
    // Fetch fresh data to ensure we have the latest clinicalData (persisted from previous save)
    const freshPatient = await getPatientByUHID(patient.uhid);
    const targetPatient = freshPatient ? { ...freshPatient, visitCount: patient.visitCount } : patient; // Keep EXACT visit count from row
    
    // Fetch full history so we can edit the current visit
    const history = await getPatientHistory(patient.uhid);
    targetPatient.prescriptionHistory = history;

    setActivePatient(targetPatient);
    setHistoryPatient(targetPatient); // Also select for history view
    setViewOnlyRecord(undefined); // Ensure it's edit mode
    setPrescriptionModalOpen(true);
  };

  const openHistoryView = (record: PrescriptionRecord, patient: Patient) => {
    setActivePatient(patient);
    setViewOnlyRecord(record);
    setPrescriptionModalOpen(true);
  };

  const ordinals = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">Prescribe Patient</h1>
          <p className="text-sm text-text-muted">Assigned to: <span className="text-primary font-medium">{user.name}</span></p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-40 bg-blue-700 p-4"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Pane: Pending Patients */}
        <Card title={`Patients for ${formatDate(selectedDate)}`} className="h-[600px] flex flex-col">
          <div className="flex-1 overflow-auto">
            <Table headers={['Name', 'Type', 'Status', 'Action']}>
              {filteredVisits.length > 0 ? filteredVisits.map(v => {
                const patientLike: Patient = {
                  uhid: v.uhid, date: v.visitDate, userType: v.userType as any,
                  title: v.title, firstName: v.firstName, middleName: v.middleName,
                  lastName: v.lastName, birthDate: v.birthDate || '', age: v.age,
                  sex: v.sex as any, address: v.address, state: v.state, city: v.city,
                  taluka: v.taluka, mobile: v.mobile, email: v.email,
                  referredBy: v.referredBy || '', paymentBy: v.paymentBy || '',
                  consultantName: v.consultantName, idProofType: v.idProofType || '',
                  idProofNumber: v.idProofNumber || '', purposeOfVisit: v.purposeOfVisit || '',
                  visitCount: v.visitCount
                };

                return (
                  <tr
                    key={`${v.uhid}-${v.visitCount}`}
                    className={`cursor-pointer transition-colors ${historyPatient?.uhid === v.uhid ? 'bg-primary/20 border-l-4 border-l-primary' : 'hover:bg-white/5'}`}
                    onClick={() => handlePatientSelect(patientLike)}
                    onDoubleClick={() => openPrescribeModal(patientLike)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div>{v.firstName} {v.lastName}</div>
                      <div className="text-[10px] text-text-muted font-mono">{v.uhid} | Visit #{v.visitCount}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${v.userType === 'New' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                        {v.userType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {v.prescriptionCount > 0 ? (
                        <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                          <Activity size={10} /> Checked
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted opacity-50 flex items-center gap-1">
                          <Clock size={10} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); openPrescribeModal(patientLike); }}>
                        <Stethoscope size={16} className="mr-1" /> Create
                      </Button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                    No patients found for today.
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Card>

        {/* Right Pane: Prescription History */}
        <Card
          title={historyPatient ? `Rx History: ${historyPatient.firstName} ${historyPatient.lastName}` : "Patient Prescription History"}
          className="h-[600px] flex flex-col"
        >
          <div className="flex-1 overflow-auto relative">
            {!historyPatient ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted opacity-60">
                <ClipboardList size={48} className="mb-4" />
                <p className="text-lg font-medium">Please select a patient</p>
                <p className="text-sm">Click on a patient to view their prescription history</p>
              </div>
            ) : (!historyPatient.prescriptionHistory || historyPatient.prescriptionHistory.length === 0) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted opacity-60">
                <p>No prescription history found for this patient.</p>
              </div>
            ) : (
              <Table headers={['Date', 'Consultant', 'Visit', 'Actions']}>
                {/* Show Ascending (Visit 1 first) */}
                {[...historyPatient.prescriptionHistory]
                  .sort((a, b) => (a.visitCount || 0) - (b.visitCount || 0))
                  .map((record) => (
                    <tr key={record.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm">{formatDate(record.date)}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{historyPatient.consultantName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-background border border-border px-2 py-1 rounded">
                          {ordinals(record.visitCount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openHistoryView(record, historyPatient)}
                          title="View & Print"
                        >
                          <Eye size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openPrescribeModal({...historyPatient, visitCount: record.visitCount})}
                          title="Edit Prescription"
                        >
                          <Edit3 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </Table>
            )}
          </div>
        </Card>
      </div>

      {/* Prescription Modal (Shared for Creation and Viewing History) */}
      {activePatient && (
        <PrescriptionModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => setPrescriptionModalOpen(false)}
          patient={activePatient}
          viewOnlyRecord={viewOnlyRecord}
        />
      )}
    </div>
  );
};