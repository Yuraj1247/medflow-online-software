
import { Medicine, MedicineType, UserRole, RoleDefinition, User } from "./types";

export const APP_NAME = "MedFlow OPD";

// Initial Seed Data (Only used if storage is empty)
export const INITIAL_ROLES: RoleDefinition[] = [
    { id: 'r1', name: 'Administrator', type: UserRole.ADMIN },
    { id: 'r2', name: 'Receptionist', type: UserRole.RECEPTIONIST },
    { id: 'r3', name: 'Consultant', type: UserRole.DOCTOR },
];

export const INITIAL_USERS: User[] = [
    { id: 'u1', name: 'Admin', role: UserRole.ADMIN, designation: 'Administrator', pin: 'admin' },
];

export const INITIAL_MEDICINES: Medicine[] = [
  { id: 'm1', name: 'Paracetamol 500mg', type: MedicineType.TAB, code: 'PARA01' },
  { id: 'm2', name: 'Amoxicillin 500mg', type: MedicineType.CAP, code: 'AMOX01' },
  { id: 'm3', name: 'Cough Syrup', type: MedicineType.SYRP, code: 'COGH01' },
  { id: 'm4', name: 'Pantoprazole 40mg', type: MedicineType.TAB, code: 'PANT01' },
  { id: 'm5', name: 'Diclofenac Gel', type: MedicineType.OINT, code: 'DICL01' },
];

export const BILL_PARTICULARS = [
  { name: 'Consultation Fee', defaultRate: 500 },
  { name: 'Follow-up Fee', defaultRate: 300 },
  { name: 'Dressing Charges', defaultRate: 200 },
  { name: 'Injection Charges', defaultRate: 150 },
  { name: 'ECG', defaultRate: 600 },
  { name: 'Blood Sugar Test', defaultRate: 100 },
];

// --- DEFAULTS FOR MASTER DATA INITIALIZATION ---

export const DEFAULT_STATES_CITIES: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry", "Tirupati", "Kakinada", "Kadapa", "Anantapur", "Eluru", "Vizianagaram", "Ongole", "Nandyal", "Machilipatnam", "Adoni", "Tenali", "Proddatur", "Chittoor", "Hindupur"],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Namsai", "Changlang", "Bomdila", "Tawang", "Ziro", "Roing", "Tezu"],
  "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Diphu", "Dhubri", "North Lakhimpur", "Karimganj", "Sivasagar", "Goalpara", "Barpeta"],
  "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", "Bihar Sharif", "Arrah", "Begusarai", "Katihar", "Munger", "Chhapra", "Danapur", "Saharsa", "Hajipur", "Sasaram", "Dehri", "Siwan", "Bettiah", "Motihari"],
  "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Rajnandgaon", "Raigarh", "Jagdalpur", "Ambikapur", "Dhamtari", "Chirmiri", "Bhatapara", "Durg", "Dalli-Rajhara", "Mahasamund"],
  "Goa": ["Panaji", "Vasco da Gama", "Margao", "Mapusa", "Ponda", "Bicholim", "Curchorem", "Sanguem", "Canacona", "Valpoi"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Gandhinagar", "Gandhidham", "Anand", "Navsari", "Morbi", "Nadiad", "Surendranagar", "Bharuch", "Mehsana", "Bhuj", "Porbandar", "Palanpur", "Valsad", "Vapi"],
  "Haryana": ["Faridabad", "Gurugram", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat", "Panchkula", "Bhiwani", "Sirsa", "Bahadurgarh", "Jind", "Thanesar", "Kaithal", "Rewari", "Palwal"],
  "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi", "Palampur", "Baddi", "Nahan", "Paonta Sahib", "Sundarnagar", "Chamba", "Una", "Kullu", "Hamirpur", "Bilaspur", "Yol"],
  "Jharkhand": ["Jamshedpur", "Dhanbad", "Ranchi", "Bokaro Steel City", "Deoghar", "Phusro", "Hazaribagh", "Giridih", "Ramgarh", "Medininagar", "Chirkunda", "Jhumri Tilaiya", "Sahibganj"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi", "Kalaburagi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Raichur", "Bidar", "Hospet", "Hassan", "Gadag-Betageri", "Udupi", "Robertsonpet", "Bhadravati", "Chitradurga", "Kolar", "Mandya"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", "Kannur", "Alappuzha", "Kottayam", "Palakkad", "Manjeri", "Thalassery", "Thrippunithura", "Ponnani", "Vatakara", "Kanhangad", "Payyanur", "Koyilandy", "Parappanangadi", "Kalamassery", "Kodungallur", "Malappuram"],
  "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Murwara (Katni)", "Singrauli", "Burhanpur", "Khandwa", "Bhind", "Chhindwara", "Guna", "Shivpuri", "Vidisha", "Chhatarpur", "Damoh", "Mandsaur", "Khargone"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Pimpri-Chinchwad", "Nashik", "Kalyan-Dombivli", "Vasai-Virar", "Aurangabad", "Navi Mumbai", "Solapur", "Mira-Bhayandar", "Bhiwandi", "Jalgaon", "Amravati", "Nanded", "Kolhapur", "Ulhasnagar", "Sangli-Miraj & Kupwad", "Malegaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Ambarnath", "Bhusawal", "Panvel", "Badlapur", "Beed", "Gondia", "Satara", "Barshi", "Yavatmal", "Achalpur", "Osmanabad", "Nandurbar", "Wardha", "Udgir", "Hinganghat"],
  "Manipur": ["Imphal", "Thoubal", "Lilong", "Mayang Imphal", "Bishnupur", "Churachandpur", "Kakching", "Jiribam", "Ukhrul", "Wangjing"],
  "Meghalaya": ["Shillong", "Tura", "Nongstoin", "Jowai", "Baghmara", "Williamnagar", "Resubelpara", "Mawlai", "Nongthymmai", "Nongpoh"],
  "Mizoram": ["Aizawl", "Lunglei", "Saiha", "Champhai", "Kolasib", "Serchhip", "Lawngtlai", "Mamit", "Vairengte", "Bairabi"],
  "Nagaland": ["Dimapur", "Kohima", "Mokokchung", "Tuensang", "Wokha", "Zunheboto", "Chumoukedima", "Diphupar", "Mon", "Phek"],
  "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Bhadrak", "Baripada", "Jharsuguda", "Jeypore", "Bargarh", "Rayagada", "Bhawanipatna", "Dhenkanal", "Barbil", "Kendujhar", "Sunabeda"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Hoshiarpur", "Mohali", "Batala", "Pathankot", "Moga", "Abohar", "Malerkotla", "Khanna", "Phagwara", "Muktsar", "Barnala", "Rajpura", "Firozpur", "Kapurthala"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Udaipur", "Bhilwara", "Alwar", "Bharatpur", "Sikar", "Pali", "Sri Ganganagar", "Chittorgarh", "Dholpur", "Tonk", "Hanumangarh", "Beawar", "Kishangarh", "Jhunjhunu", "Baran", "Jhalawar"],
  "Sikkim": ["Gangtok", "Namchi", "Rangpo", "Jorethang", "Mangan", "Singtam", "Geyzing", "Nayabazar"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Tiruppur", "Salem", "Erode", "Tirunelveli", "Vellore", "Thoothukkudi", "Dindigul", "Thanjavur", "Ranipet", "Sivakasi", "Karur", "Udhagamandalam", "Hosur", "Nagercoil", "Kancheepuram", "Kumarapalayam", "Karaikudi", "Neyveli", "Cuddalore", "Kumbakonam", "Tiruvannamalai"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet", "Miryalaguda", "Jagtial", "Mancherial", "Nirmal", "Sircilla", "Kamareddy", "Kothagudem", "Siddipet"],
  "Tripura": ["Agartala", "Dharmanagar", "Udaipur", "Kailasahar", "Bishalgarh", "Teliamura", "Khowai", "Belonia", "Melaghar", "Ambassa"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Meerut", "Varanasi", "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Noida", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura", "Ayodhya", "Rampur", "Shahjahanpur", "Farrukhabad", "Maunath Bhanjan", "Hapur", "Etawah", "Mirzapur", "Bulandshahr", "Sambhal", "Amroha", "Hardoi", "Fatehpur", "Raebareli", "Orai", "Sitapur", "Bahraich", "Modinagar", "Unnao", "Jaunpur", "Lakhimpur", "Hathras", "Banda", "Pilibhit", "Mughalsarai", "Barabanki"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Kashipur", "Rishikesh", "Nainital", "Srinagar", "Pithoragarh", "Manglaur", "Ramnagar", "Jaspur", "Kichha", "Gangotri", "Yamunotri", "Badrinath", "Kedarnath"],
  "West Bengal": ["Kolkata", "Asansol", "Siliguri", "Durgapur", "Bardhaman", "Malda", "Baharampur", "Habra", "Kharagpur", "Shantipur", "Dankuni", "Dhulian", "Ranaghat", "Haldia", "Raiganj", "Krishnanagar", "Nabadwip", "Medinipur", "Jalpaiguri", "Balurghat", "Basirhat", "Bankura", "Chakdaha", "Darjeeling", "Alipurduar", "Purulia", "Jangipur", "Bongaon", "Cooch Behar"],
  "Andaman and Nicobar Islands": ["Port Blair", "Garacharma", "Bamboo Flat", "Prothrapur", "Diglipur"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa", "Amli"],
  "Delhi": ["New Delhi", "Delhi", "Narela", "Palam", "Alipur", "Kotla", "Vasant Vihar", "Hauz Khas", "Defence Colony", "Karol Bagh", "Chandni Chowk", "Connaught Place", "Dwarka", "Rohini", "Pitampura", "Janakpuri", "Lajpat Nagar", "Saket", "Mehrauli", "Najafgarh"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua", "Sopore", "Udhampur", "Rajouri", "Punch", "Pulwama", "Kulgam", "Kupwara", "Bandipora", "Ganderbal", "Kishtwar", "Doda", "Samba", "Reasi", "Ramban"],
  "Ladakh": ["Leh", "Kargil", "Diskit", "Padum", "Nyoma"],
  "Lakshadweep": ["Kavaratti", "Agatti", "Andrott", "Amini", "Kalpeni", "Kadmat", "Kiltan", "Chetlat", "Bitra", "Minicoy"],
  "Puducherry": ["Puducherry", "Karaikal", "Yanam", "Mahe", "Ozhukarai", "Villianur"]
};

export const DEFAULT_CONSULTANTS: string[] = [];

export const DEFAULT_REFERRED_BY = ['Self', 'Family', 'Doctor', 'Friends', 'Neighbours'];
export const DEFAULT_PAYMENT_BY = ['Self', 'Insurance', 'Company'];
export const DEFAULT_PURPOSE_VISIT = ['Consultation', 'Fever', 'Checkup', 'Follow-up', 'Report Review'];

export const DEFAULT_DOSAGES = [
  { value: '1-0-0', label: '1-0-0 (Morning)' },
  { value: '0-1-0', label: '0-1-0 (Afternoon)' },
  { value: '0-0-1', label: '0-0-1 (Night)' },
  { value: '1-0-1', label: '1-0-1 (Morn & Night)' },
  { value: '1-1-1', label: '1-1-1 (All Times)' },
  { value: 'SOS', label: 'SOS (As needed)' }
];

export const DEFAULT_INSTRUCTIONS = [
  { value: 'After Food', label: 'After Food' },
  { value: 'Before Food', label: 'Before Food' },
  { value: 'With Food', label: 'With Food' },
  { value: 'Empty Stomach', label: 'Empty Stomach' }
];

export const DEFAULT_CLINICAL_SUGGESTIONS: Record<string, string[]> = {
    complaint: [
        'Fever', 'Cough', 'Cold', 'Headache', 'Body Ache', 'Weakness', 'Dizziness', 
        'Chest Pain', 'Breathlessness', 'Abdominal Pain', 'Vomiting', 'Loose Motion'
    ],
    history: [
        'Hypertension (HTN)', 'Diabetes Mellitus (DM)', 'Asthma', 'Thyroid Disorder', 
        'Tuberculosis (TB)', 'Ischemic Heart Disease (IHD)', 'Drug Allergy'
    ],
    findings: [
        'Conscious & Oriented', 'Pallor', 'Icterus', 'Clubbing', 'Lymphadenopathy', 
        'Edema', 'Throat Congested', 'Chest Clear', 'Wheezing', 'Crepitations'
    ],
    investigation: [
        'CBC', 'Urine Routine', 'RBS', 'HbA1c', 'Lipid Profile', 'Liver Function Test (LFT)', 
        'Kidney Function Test (KFT)', 'Thyroid Profile', 'Widal Test', 'Dengue NS1'
    ],
    diagnosis: [
        'Viral Fever', 'Upper Respiratory Tract Infection (URTI)', 'Acute Gastroenteritis', 
        'Typhoid Fever', 'Malaria', 'Dengue Fever', 'Pneumonia', 'UTI'
    ],
    actionPlan: [
        'Conservative Management', 'Hospital Admission', 'Observation', 'Refer to Specialist', 
        'Review with Reports'
    ],
    advice: [
        'Complete Bed Rest', 'Plenty of oral fluids', 'Soft Diet', 'Bland Diet', 
        'Avoid Oily/Spicy Food', 'Steam Inhalation', 'Salt Water Gargle'
    ],
    instruction: [
        'Take medicines after food', 'Take medicines on time', 'Do not skip doses', 
        'Review if symptoms persist'
    ]
};

export const INDIAN_STATES_CITIES = DEFAULT_STATES_CITIES;

export const DEFAULT_MEDICINE_TYPES = [
  'Tablet', 'Capsule', 'Powder', 'Granules', 'Lozenge', 'Syrup', 'Suspension', 'Solution', 'Drops',
  'Ointment', 'Cream', 'Gel', 'Paste', 'Suppository', 'Pessary', 'Inhaler', 'Nebulizer solution',
  'Injection', 'Infusion', 'Transdermal patch', 'Spray', 'Churna', 'Vati', 'Kwath', 'Asava',
  'Arishta', 'Avaleha', 'Ghrita', 'Taila', 'Bhasma', 'Pishti', 'Satva', 'Arka', 'Lepa', 'Anjana',
  'Nasya', 'Dhoop'
];
