
import { Bill, Medicine, Patient, MasterData, User, RoleDefinition, UserRole, ClinicalPreferences, PrescriptionRecord, DoctorPageSettings, PatientDocument, ClinicProfile } from "../types";
import {
  INITIAL_MEDICINES,
  DEFAULT_CONSULTANTS,
  DEFAULT_REFERRED_BY,
  DEFAULT_PAYMENT_BY,
  DEFAULT_PURPOSE_VISIT,
  DEFAULT_STATES_CITIES,
  DEFAULT_DOSAGES,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_CLINICAL_SUGGESTIONS,
  INITIAL_USERS,
  INITIAL_ROLES,
  BILL_PARTICULARS,
  DEFAULT_MEDICINE_TYPES
} from "../constants";

// CONFIGURATION
// For LAN usage: Change this to the Server's IP Address (e.g., "http://192.168.1.10:5000")
// For Localhost (Same PC): "http://localhost:5000"
// For LAN usage: Automatically detects the server IP and port.
// If running via Vite (port 3000/5173), defaults to backend on port 5000.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const getHeaders = () => {
  const headers: any = { 'Content-Type': 'application/json' };
  const auth = sessionStorage.getItem('medflow_auth_token');
  if (auth) {
    headers['Authorization'] = `Bearer ${auth}`;
  }
  return headers;
};

// --- Master Data ---

export const getMasterData = async (): Promise<MasterData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/master`);
    if (!response.ok) throw new Error("Failed to fetch master data");
    const data = await response.json();

    // Default object for merging
    const defaults: MasterData = {
      consultants: DEFAULT_CONSULTANTS,
      referredBy: DEFAULT_REFERRED_BY,
      paymentBy: DEFAULT_PAYMENT_BY,
      purposeOfVisit: DEFAULT_PURPOSE_VISIT,
      statesAndCities: DEFAULT_STATES_CITIES,
      districtsAndTalukas: {},
      idProofs: ['Aadhar Card', 'PAN Card', 'Driving License', 'Passport', 'Voter ID'],
      doctorRoles: ['General Physician', 'Dentist', 'Physiotherapist', 'Surgeon', 'Pediatrician'],
      dosages: DEFAULT_DOSAGES,
      instructions: DEFAULT_INSTRUCTIONS,
      clinicalNotes: DEFAULT_CLINICAL_SUGGESTIONS,
      totalPatientLimit: 0,
      enablePatientLimit: true,
      enableStaffManagement: true,
      enableDiscount: true,
      enableGst: true,
      gstRate: 18,
      billParticulars: BILL_PARTICULARS,
      paymentModes: ['CASH', 'UPI', 'CARD', 'NET_BANKING'],
      clinicName: 'MEDFLOW HOSPITAL',
      clinicAddress: 'Hospital Address',
      clinicContact: 'Contact Info',
      medicineTypes: DEFAULT_MEDICINE_TYPES,
    } as unknown as MasterData;

    // Merge fetched data with defaults
    return { ...defaults, ...data };
  } catch (error) {
    console.error(error);
    // Return defaults as fallback instead of empty object
    return {
        consultants: DEFAULT_CONSULTANTS,
        referredBy: DEFAULT_REFERRED_BY,
        paymentBy: DEFAULT_PAYMENT_BY,
        purposeOfVisit: DEFAULT_PURPOSE_VISIT,
        statesAndCities: DEFAULT_STATES_CITIES,
        districtsAndTalukas: {},
        idProofs: ['Aadhar Card', 'PAN Card', 'Driving License', 'Passport', 'Voter ID'],
        doctorRoles: ['General Physician', 'Dentist', 'Physiotherapist', 'Surgeon', 'Pediatrician'],
        billParticulars: BILL_PARTICULARS,
        paymentModes: ['CASH', 'UPI', 'CARD', 'NET_BANKING'],
        clinicName: 'MEDFLOW HOSPITAL',
        clinicAddress: 'Hospital Address',
        clinicContact: 'Contact Info',
        medicineTypes: DEFAULT_MEDICINE_TYPES,
    } as unknown as MasterData;
  }
};

export const saveMasterData = async (data: MasterData) => {
  try {
    await fetch(`${API_BASE_URL}/master`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
  } catch (error) {
    console.error(error);
  }
};

export const resetMasterData = async (): Promise<MasterData> => {
  // Implementation would need to force overwrite on backend. 
  // Skipping for brevity as it's rarely used in prod.
  return await getMasterData();
};

// --- DOCTOR PREFERENCES ---

export const getDoctorPreferences = async (userId: string | undefined): Promise<ClinicalPreferences> => {
  if (!userId) return { dosages: [], instructions: [], clinicalNotes: {} };
  try {
    const response = await fetch(`${API_BASE_URL}/master/prefs/${userId}`);
    const data = await response.json();
    const global_ = await getMasterData();

    return {
      dosages: data.dosages || global_.dosages || [],
      instructions: data.instructions || global_.instructions || [],
      clinicalNotes: data.clinicalNotes || global_.clinicalNotes || []
    } as unknown as ClinicalPreferences;
  } catch (e) {
    console.error(e);
    return { dosages: [], instructions: [], clinicalNotes: {} };
  }
};

export const saveDoctorPreferences = async (userId: string, prefs: ClinicalPreferences) => {
  try {
    await fetch(`${API_BASE_URL}/master/prefs/${userId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(prefs)
    });
  } catch (e) { console.error(e); }
};

// --- DOCTOR PAGE SETTINGS ---

export const getDoctorPageSettings = async (doctorId: string): Promise<DoctorPageSettings> => {
  try {
    const response = await fetch(`${API_BASE_URL}/doctor/page-settings/${doctorId}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error("Failed to fetch doctor page settings");
    return await response.json();
  } catch (error) {
    console.error(error);
    // Return default settings on failure
    return {
      doctor_id: doctorId,
      paper_size: 'A4',
      header_enabled: 1,
      margin_top_cm: 2.0,
      margin_left_cm: 2.0,
      margin_right_cm: 2.0,
      margin_bottom_cm: 2.0
    };
  }
};

export const saveDoctorPageSettings = async (settings: DoctorPageSettings) => {
  try {
    const response = await fetch(`${API_BASE_URL}/doctor/page-settings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to save doctor page settings");
    }
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// --- Users & Roles ---

export const getUsers = async (): Promise<User[]> => {
  const res = await fetch(`${API_BASE_URL}/users`);
  return await res.json();
};

export const saveUser = async (user: User): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(user)
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to save user");
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE', headers: getHeaders() });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to delete user");
  }
};


export const getRoles = async (): Promise<RoleDefinition[]> => {
  const res = await fetch(`${API_BASE_URL}/users/roles`);
  return await res.json();
};

// --- Patients ---

export const getPatients = async (): Promise<Patient[]> => {
  const res = await fetch(`${API_BASE_URL}/patients`);
  return await res.json();
};

export const savePatient = async (patient: Patient): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/patients`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(patient)
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || errorData.error || "Failed to save patient");
  }
};

export const deletePatient = async (uhid: string): Promise<void> => {
  await fetch(`${API_BASE_URL}/patients/${uhid}`, { method: 'DELETE', headers: getHeaders() });
};

export const getPatientByUHID = async (uhid: string): Promise<Patient | undefined> => {
  try {
    const res = await fetch(`${API_BASE_URL}/patients/${uhid}`);
    if (res.status === 404) return undefined;
    return await res.json();
  } catch { return undefined; }
};

export const generateUHID = (): string => {
  const prefix = "UHID";
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${random}`;
};

// --- Visits / Clinical Data ---

export const saveVisit = async (uhid: string, date: string, visitCount: number, clinicalData: any) => {
  const res = await fetch(`${API_BASE_URL}/visits`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ uhid, date, visitCount, data: clinicalData })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Failed to save visit');
  }
};

export const getPatientHistory = async (uhid: string): Promise<PrescriptionRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/visits/${uhid}`);
  return await res.json();
};

export const getAllVisits = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE_URL}/visits`);
  return await res.json();
};

export const deleteVisit = async (uhid: string, visitCount: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/visits/${uhid}/${visitCount}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Failed to delete visit');
  }
};

// --- Medicines ---

export const getMedicines = async (): Promise<Medicine[]> => {
  const res = await fetch(`${API_BASE_URL}/medicines`);
  return await res.json();
};

export const saveMedicine = async (medicine: Medicine): Promise<void> => {
  await fetch(`${API_BASE_URL}/medicines`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(medicine)
  });
};

export const deleteMedicine = async (id: string): Promise<void> => {
  await fetch(`${API_BASE_URL}/medicines/${id}`, { method: 'DELETE', headers: getHeaders() });
};

// --- Bills ---

export const getBills = async (): Promise<Bill[]> => {
  const res = await fetch(`${API_BASE_URL}/bills`);
  return await res.json();
};

export const saveBill = async (bill: Bill): Promise<void> => {
  await fetch(`${API_BASE_URL}/bills`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(bill)
  });
};

export const generateBillNo = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// --- Utils ---




export const formatDate = (isoDate: string | undefined): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoDate;
};

// --- Auth ---

export const getStoredAuth = (): User | null => {
  const data = sessionStorage.getItem('medflow_auth_user');
  return data ? JSON.parse(data) : null;
};

export const setStoredAuth = (user: User) => {
  sessionStorage.setItem('medflow_auth_user', JSON.stringify(user));
};

export const loginAPI = async (userId: string, pin: string) => {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, pin })
  });
  if (!res.ok) throw new Error("Login Failed");
  const data = await res.json();
  // store token
  sessionStorage.setItem('medflow_auth_token', data.token);
  return data.user;
};

export const getDeveloperConfig = async () => {
  const res = await fetch(`${API_BASE_URL}/developer/config`);
  return await res.json();
};

export const requestDeveloperOTP = async (email: string) => {
  const res = await fetch(`${API_BASE_URL}/developer/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Failed to request OTP");
  return data;
};

export const verifyDeveloperOTP = async (otp: string) => {
  const res = await fetch(`${API_BASE_URL}/developer/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Verification failed");

  if (data.sessionToken) {
    sessionStorage.setItem('medflow_developer_token', data.sessionToken);
  }
  return data;
};

export const resetAdminPasswordAPI = async (newPassword: string) => {
  const token = sessionStorage.getItem('medflow_developer_token');
  const res = await fetch(`${API_BASE_URL}/developer/reset-admin-password`, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'x-developer-token': token || ''
    },
    body: JSON.stringify({ newPassword })
  });
  if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || data.error || "Reset failed");
  }
  return await res.json();
};

export const setAdminEmailAPI = async (email: string) => {
  const token = sessionStorage.getItem('medflow_developer_token');
  const res = await fetch(`${API_BASE_URL}/developer/set-admin-email`, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'x-developer-token': token || ''
    },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || data.error || "Failed to set admin email");
  }
  return await res.json();
};

export const requestDeletionOTPAPI = async () => {
  const res = await fetch(`${API_BASE_URL}/developer/request-delete-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Failed to request deletion OTP");
  return data;
};

export const clearStoredAuth = () => {

  sessionStorage.removeItem('medflow_auth_user');
  sessionStorage.removeItem('medflow_auth_token');
};

export const saveRole = async (role: RoleDefinition): Promise<void> => {
  console.warn("saveRole: Dynamic role creation not fully implemented in backend yet.");
};

export const deleteRole = async (id: string): Promise<void> => {
  console.warn("deleteRole: Dynamic role deletion not fully implemented in backend yet.");
};

export const updateConsultantNameInRecords = async (oldName: string, newName: string) => {
  try {
    await fetch(`${API_BASE_URL}/users/rename-consultant`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldName, newName })
    });
  } catch (e) {
    console.error("Renaming failed", e);
  }
};

// --- Subscription ---

export interface SubscriptionStatus {
  is_lifetime: number;
  start_date: string;
  end_date: string;
  last_checked_date: string;
  status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED';
  code?: string;
}

export const getSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
  const res = await fetch(`${API_BASE_URL}/subscription/status`);
  return await res.json();
};

export const updateSubscriptionAPI = async (payload: {
  is_lifetime: boolean,
  start_date: string,
  end_date: string
}) => {
  const token = sessionStorage.getItem('medflow_developer_token');
  if (!token) throw new Error("Developer session expired. Please re-authenticate.");

  const res = await fetch(`${API_BASE_URL}/subscription/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-developer-token': token
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || data.error || "Update failed");
  }
  return await res.json();
};

// --- Database Management ---

export const importDatabase = async (file: File) => {
  const formData = new FormData();
  formData.append('database', file);

  const headers: any = {};
  const auth = sessionStorage.getItem('medflow_auth_token');
  if (auth) headers['Authorization'] = `Bearer ${auth}`;

  const res = await fetch(`${API_BASE_URL}/database/import`, {
    method: 'POST',
    headers: headers,
    body: formData
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Import failed');
  }
  return await res.json();
};

export const getExportDatabaseUrl = () => {
  return `${API_BASE_URL}/database/export`;
};

export const deleteDatabase = async () => {
  const res = await fetch(`${API_BASE_URL}/database/delete`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Delete failed');
  }
  return await res.json();
};

// --- Analytics ---

export const getTodayAnalytics = async () => {
  const res = await fetch(`${API_BASE_URL}/analytics/today?t=${Date.now()}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return await res.json();
};

export const getOverallAnalytics = async (startDate?: string, endDate?: string) => {
  let url = `${API_BASE_URL}/analytics/overall?t=${Date.now()}`;
  if (startDate && endDate) {
    url += `&startDate=${startDate}&endDate=${endDate}`;
  }
  const res = await fetch(url, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch overall analytics');
  return await res.json();
};


export const getPatientDocuments = async (uhid: string): Promise<PatientDocument[]> => {
  const res = await fetch(`${API_BASE_URL}/digilocker/${uhid}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch patient documents');
  return await res.json();
};

export const uploadPatientDocument = async (uhid: string, file: File): Promise<{ fileName: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  const headers = getHeaders();
  // Note: Let the browser automatically set the correct Content-Type header with the multipart boundary
  delete headers['Content-Type'];

  const res = await fetch(`${API_BASE_URL}/digilocker/${uhid}/upload`, {
    method: 'POST',
    headers,
    body: formData
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to upload document');
  }
  return await res.json();
};

export const updatePatientDocumentName = async (id: number, customName: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/digilocker/document/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ customName })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to update document name');
  }
};

export const deletePatientDocument = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/digilocker/document/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete document');
  }
};

export const getPatientDocumentViewUrl = (id: number): string => {
  const token = sessionStorage.getItem('medflow_auth_token');
  return `${API_BASE_URL}/digilocker/document/${id}/view?token=${token}`;
};

