export enum UserRole {
  ADMIN = 'ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
  DOCTOR = 'DOCTOR'
}

export type MedicineType = string;

export const MedicineType = {
  TAB: 'Tablet',
  SYRP: 'Syrup',
  CAP: 'Capsule',
  INJ: 'Injection',
  OINT: 'Ointment',
  DROP: 'Drops'
};

export interface User {
  id: string;
  name: string;
  role: UserRole; // System Level Permission
  designation: string; // Custom Role Name (e.g. Senior Surgeon, Dentist)
  pin?: string;
}

export interface RoleDefinition {
  id: string;
  name: string;
  type: UserRole;
}

export interface Vitals {
  bp: string;
  temp: string;
  spo2: string;
  pulse: string;
  height?: string; // cm
  weight?: string; // kg
  bmi?: string;
}

export interface Patient {
  uhid: string;
  date: string; // ISO String YYYY-MM-DD
  userType: 'New' | 'Old';
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  address: string;
  state?: string;
  city?: string;
  taluka?: string;
  mobile: string;
  email?: string; // Added Email/Gmail field
  referredBy: string;
  paymentBy: string;
  consultantName: string;
  idProofType: string;
  idProofNumber: string;
  purposeOfVisit: string;
  clinicalData?: ClinicalData;
  visitCount?: number;
  prescriptionHistory?: PrescriptionRecord[];
}

export interface ClinicalData {
  complaint: string;
  history: string;
  findings: string;
  investigation: string;
  diagnosis: string;
  actionPlan: string;

  // New Fields Requested
  treatment: string;
  advice: string;
  instruction: string;

  // Legacy / Unused in current view (Optional)
  previousIntervention?: string;
  riskFactors?: string;

  prescriptions: PrescriptionItem[];
  nextVisitDate?: string;

  vitals: Vitals;

  // Track which fields to print (true = print, false = hide)
  printSettings: { [key: string]: boolean };
}

export interface PrescriptionRecord {
  id: string;
  date: string;
  visitCount: number;
  data: ClinicalData;
}

export interface PrescriptionItem {
  medicineName: string;
  type: MedicineType;
  dosage: string; // e.g., 1-0-1
  instruction: string; // e.g., After food
  days: number;
}

export interface Medicine {
  id: string;
  name: string;
  type: MedicineType;
  code: string;
}

export interface BillItem {
  id: string;
  particulars: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Bill {
  billNo: string;
  uhid: string;
  patientName: string;
  date: string;
  consultant: string;
  items: BillItem[];
  total: number; // This represents SubTotal (Sum of Items)
  visitCount?: number;

  // New Billing Fields
  paymentMode?: string;
  discountType?: 'Percentage' | 'Fixed';
  discountValue?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

export interface DoctorPageSettings {
  id?: number;
  doctor_id: string;
  paper_size: 'A4' | 'A5';
  header_enabled: number; // 0 or 1 for SQLite
  margin_top_cm: number;
  margin_left_cm: number;
  margin_right_cm: number;
  margin_bottom_cm: number;
  updated_at?: string;
}

// --- MASTER DATA INTERFACES ---

// Subset of data that is specific to a doctor
export interface ClinicalPreferences {
  dosages: { value: string; label: string }[];
  instructions: { value: string; label: string }[];
  clinicalNotes: Record<string, string[]>;
  defaultFollowUpDays?: number; // Default follow-up gap in days
}

export interface MasterData extends ClinicalPreferences {
  consultants: string[];
  referredBy: string[];
  paymentBy: string[];
  purposeOfVisit: string[];
  statesAndCities: Record<string, string[]>;
  districtsAndTalukas?: Record<string, string[]>;
  idProofs: string[]; // Dynamic ID Proofs
  doctorRoles: string[]; // Dynamic Doctor Specialties (Dentist, Physio, etc.)

  // Developer Controls
  totalPatientLimit?: number; // Lifetime Limit Value
  enablePatientLimit: boolean; // Toggle for Limit
  enableStaffManagement: boolean; // Toggle for Staff Add/Edit

  // New Configs
  enableDiscount: boolean;
  enableGst: boolean;
  gstRate: number; // Configurable GST Percentage (default 18)
  billParticulars: { name: string; defaultRate: number }[];
  paymentModes: string[];

  // Clinic Info
  clinicName?: string;
  clinicAddress?: string;
  clinicContact?: string;
  clinicProfile?: ClinicProfile;

  // Dynamic Medicine Types
  medicineTypes: string[];
}

export interface ClinicProfile {
  id?: number;
  clinic_name: string;
  hospital_name: string;
  logo: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gst_number: string;
  registration_number: string;
  letterhead_enabled: number;
  footer_text: string;
}

export interface SubscriptionStatus {
  is_lifetime: number;
  start_date: string;
  end_date: string;
  last_checked_date: string;
  status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED';
  code?: string;
}

export interface PatientDocument {
  id: number;
  uhid: string;
  default_name: string;
  custom_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}
