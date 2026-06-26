const pg = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');

// PostgreSQL Pool setup
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// For local/temp uploads (ephemeral disk storage on Render)
const storagePath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(storagePath)) {
  try {
    fs.mkdirSync(storagePath, { recursive: true });
  } catch (err) {
    console.error('Failed to create storage directory:', err);
  }
}

const DB_PATH = path.join(process.cwd(), 'database.sqlite'); // Dummy path for compatibility checks
const SALT_ROUNDS = 12;

// Case mapping for SQLite/PostgreSQL column names
const COLUMN_CASE_MAP = {
  usertype: 'userType',
  firstname: 'firstName',
  middlename: 'middleName',
  lastname: 'lastName',
  birthdate: 'birthDate',
  referredby: 'referredBy',
  paymentby: 'paymentBy',
  consultantname: 'consultantName',
  idprooftype: 'idProofType',
  idproofnumber: 'idProofNumber',
  purposeofvisit: 'purposeOfVisit',
  visitcount: 'visitCount',
  createdat: 'createdAt',
  nextvisitdate: 'nextVisitDate',
  printsettings: 'printSettings',
  doctor_id: 'doctor_id',
  medicinename: 'medicineName',
  billno: 'billNo',
  patientname: 'patientName',
  paymentmode: 'paymentMode',
  discounttype: 'discountType',
  discountvalue: 'discountValue'
};

function restoreCasing(row) {
  if (!row) return row;
  const newRow = {};
  for (const [key, val] of Object.entries(row)) {
    const mappedKey = COLUMN_CASE_MAP[key] || key;
    if (val instanceof Date) {
      newRow[mappedKey] = val.toISOString();
    } else {
      newRow[mappedKey] = val;
    }
  }
  return newRow;
}

// Convert SQLite query syntax and parameters to PostgreSQL
function convertQuery(sql, params = []) {
  if (typeof sql !== 'string') return sql;
  let convertedSql = sql;

  // Replace SQLite date('now') with CURRENT_DATE
  convertedSql = convertedSql.replace(/date\(\s*['"]now['"]\s*\)/gi, 'CURRENT_DATE');

  // Replace SQLite datetime('now') with CURRENT_TIMESTAMP
  convertedSql = convertedSql.replace(/datetime\(\s*['"]now['"]\s*\)/gi, 'CURRENT_TIMESTAMP');

  // Replace COLLATE NOCASE
  convertedSql = convertedSql.replace(/COLLATE\s+NOCASE/gi, '');

  // Convert LIKE to ILIKE for case-insensitive searching, matching SQLite behavior
  convertedSql = convertedSql.replace(/\bLIKE\b/g, 'ILIKE');

  // Replace SQLite parameter placeholders (?) with Postgres ($1, $2, ...)
  let paramIndex = 1;
  convertedSql = convertedSql.replace(/\?/g, () => `$${paramIndex++}`);

  return convertedSql;
}

// Wrapper mimicking sqlite/sqlite3 library for backward compatibility
const dbMock = {
  async get(sql, params = []) {
    const converted = convertQuery(sql, params);
    const res = await pool.query(converted, params);
    return restoreCasing(res.rows[0]);
  },
  async all(sql, params = []) {
    const converted = convertQuery(sql, params);
    const res = await pool.query(converted, params);
    return res.rows.map(restoreCasing);
  },
  async run(sql, params = []) {
    let converted = convertQuery(sql, params);
    
    // Auto-append RETURNING * for inserts to capture auto-incremented lastID
    const isInsert = converted.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !/returning/i.test(converted)) {
      converted += ' RETURNING *';
    }

    const res = await pool.query(converted, params);
    let lastID = null;
    
    if (isInsert && res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      // Try to find generating key
      lastID = row.id || row.billno || row.uhid || row.key || Object.values(row)[0];
    }

    return {
      lastID,
      changes: res.rowCount
    };
  },
  async exec(sql) {
    const converted = convertQuery(sql);
    // Ignore PRAGMAs or sqlite-specific commands
    if (converted.trim().toUpperCase().startsWith('PRAGMA') || converted.trim().toUpperCase().startsWith('VACUUM')) {
      return;
    }
    await pool.query(converted);
  }
};

async function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  throw new Error('JWT_SECRET environment variable is missing.');
}

async function getDB() {
  return dbMock;
}

// Audit logging utility
async function logAudit(req, action, module, description, userId = null, username = null, role = null) {
  try {
    const finalUserId = userId || req?.user?.id || 'SYSTEM';
    const finalUsername = username || req?.user?.username || 'system';
    const finalRole = role || req?.user?.role || 'SYSTEM';
    const ipAddress = req ? (req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';

    await dbMock.run(
      `INSERT INTO audit_logs (user_id, username, role, action, module, description, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [finalUserId, finalUsername, finalRole.toUpperCase(), action, module, description, ipAddress]
    );
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

async function initDB() {
  console.log('===========================================');
  console.log('     POSTGRESQL DATABASE INITIALIZATION    ');
  console.log('===========================================');
  
  // 1. Create Tables in PostgreSQL
  
  // Users Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      designation TEXT,
      password_hash TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Security Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS developer_security (
      key TEXT PRIMARY KEY,
      value_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Patient Documents (Digilocker) Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS patient_documents (
      id SERIAL PRIMARY KEY,
      uhid TEXT NOT NULL,
      default_name TEXT NOT NULL,
      custom_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Patients Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      uhid TEXT PRIMARY KEY,
      date TEXT,
      userType TEXT,
      title TEXT,
      firstName TEXT NOT NULL,
      middleName TEXT,
      lastName TEXT NOT NULL,
      birthDate TEXT,
      age INTEGER,
      sex TEXT,
      address TEXT,
      state TEXT,
      city TEXT,
      taluka TEXT,
      mobile TEXT,
      email TEXT,
      referredBy TEXT,
      paymentBy TEXT,
      consultantName TEXT,
      idProofType TEXT,
      idProofNumber TEXT,
      purposeOfVisit TEXT,
      visitCount INTEGER DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Visits (Clinical Data) Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id SERIAL PRIMARY KEY,
      uhid TEXT NOT NULL REFERENCES patients(uhid) ON DELETE CASCADE,
      date TEXT NOT NULL,
      visitCount INTEGER,
      complaint TEXT,
      history TEXT,
      findings TEXT,
      investigation TEXT,
      diagnosis TEXT,
      actionPlan TEXT,
      treatment TEXT,
      advice TEXT,
      instruction TEXT,
      bp TEXT,
      temp TEXT,
      spo2 TEXT,
      pulse TEXT,
      height TEXT,
      weight TEXT,
      bmi TEXT,
      printSettings TEXT,
      nextVisitDate TEXT
    );
  `);

  // Doctor Page Settings Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS doctor_page_settings (
      id SERIAL PRIMARY KEY,
      doctor_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paper_size TEXT DEFAULT 'A4',
      header_enabled INTEGER DEFAULT 1,
      margin_top_cm REAL DEFAULT 2.0,
      margin_left_cm REAL DEFAULT 2.0,
      margin_right_cm REAL DEFAULT 2.0,
      margin_bottom_cm REAL DEFAULT 2.0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Prescriptions Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id SERIAL PRIMARY KEY,
      visit_id INTEGER REFERENCES visits(id) ON DELETE CASCADE,
      uhid TEXT NOT NULL REFERENCES patients(uhid) ON DELETE CASCADE,
      medicineName TEXT,
      type TEXT,
      dosage TEXT,
      instruction TEXT,
      days INTEGER,
      date TEXT
    );
  `);

  // Medicines Master Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      code TEXT
    );
  `);

  // Bills Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      billNo TEXT PRIMARY KEY,
      uhid TEXT REFERENCES patients(uhid) ON DELETE SET NULL,
      patientName TEXT,
      date TEXT,
      consultant TEXT,
      total REAL,
      paymentMode TEXT,
      discountType TEXT,
      discountValue REAL,
      visitCount INTEGER,
      items TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Master Data
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS master_data (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Roles Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT
    );
  `);

  // Subscription Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS subscription (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_lifetime INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      last_checked_date TEXT,
      status TEXT DEFAULT 'ACTIVE',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Configuration Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS developer_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      developer_email TEXT NOT NULL,
      admin_email TEXT
    );
  `);

  // Developer OTP Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS developer_otp (
      id SERIAL PRIMARY KEY,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts INTEGER DEFAULT 0,
      is_used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Sessions Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS developer_sessions (
      token TEXT PRIMARY KEY,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Access Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS developer_access (
      email TEXT UNIQUE,
      access_code_hash TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Clinic Profile Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS clinic_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      clinic_name TEXT,
      hospital_name TEXT,
      logo TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      gst_number TEXT,
      registration_number TEXT,
      letterhead_enabled INTEGER DEFAULT 1,
      footer_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Audit Logs Table
  await dbMock.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      role TEXT,
      action TEXT,
      module TEXT,
      description TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Add Indexes
  await dbMock.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile);
    CREATE INDEX IF NOT EXISTS idx_patients_consultantname ON patients(consultantname);
    CREATE INDEX IF NOT EXISTS idx_patients_createdat ON patients(createdat);
    CREATE INDEX IF NOT EXISTS idx_visits_uhid ON visits(uhid);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
    CREATE INDEX IF NOT EXISTS idx_bills_patientname ON bills(patientname);
    CREATE INDEX IF NOT EXISTS idx_bills_consultant ON bills(consultant);
    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
    CREATE INDEX IF NOT EXISTS idx_subscription_status ON subscription(status);
  `);

  // Seed standard data
  await seedData(dbMock);

  // Sync calculations matching the original initialization logic
  await dbMock.exec(`
    DELETE FROM patients
    WHERE NOT EXISTS (
      SELECT 1 FROM visits WHERE visits.uhid = patients.uhid
    )
  `);

  await dbMock.exec(`
    UPDATE patients
    SET visitCount = (
      SELECT COALESCE(COUNT(*), 0)
      FROM visits
      WHERE visits.uhid = patients.uhid
    )
  `);

  // Ensure Doctor name format
  const allDocs = await dbMock.all("SELECT id, name FROM users WHERE role = 'DOCTOR'");
  for (const doc of allDocs) {
    let name = doc.name.trim();
    if (!name.toLowerCase().startsWith('dr.') && !name.toLowerCase().startsWith('dr ')) {
      const newName = `Dr. ${name}`;
      await dbMock.run("UPDATE users SET name = ? WHERE id = ?", [newName, doc.id]);
      await dbMock.run("UPDATE patients SET consultantName = ? WHERE consultantName = ?", [newName, name]);
      await dbMock.run("UPDATE bills SET consultant = ? WHERE consultant = ?", [newName, name]);
    } else if (name.toLowerCase().startsWith('dr ')) {
      const newName = `Dr. ${name.substring(3).trim()}`;
      await dbMock.run("UPDATE users SET name = ? WHERE id = ?", [newName, doc.id]);
      await dbMock.run("UPDATE patients SET consultantName = ? WHERE consultantName = ?", [newName, name]);
      await dbMock.run("UPDATE bills SET consultant = ? WHERE consultant = ?", [newName, name]);
    }
  }

  // Auto-Assign Orphaned Records if single doctor exists
  const finalDocs = await dbMock.all("SELECT name FROM users WHERE role = 'DOCTOR'");
  if (finalDocs.length === 1) {
    const mainDoc = finalDocs[0].name;
    await dbMock.run("UPDATE patients SET consultantName = ? WHERE consultantName NOT IN (SELECT name FROM users WHERE role = 'DOCTOR')", [mainDoc]);
    await dbMock.run("UPDATE bills SET consultant = ? WHERE consultant NOT IN (SELECT name FROM users WHERE role = 'DOCTOR')", [mainDoc]);
  }

  console.log('PostgreSQL Database initialized successfully');
}

async function seedData(db) {
  // Admin user seed (Pull admin username and password from environment)
  const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || '$Medflow989200';
  const adminName = process.env.DEFAULT_ADMIN_NAME || 'Administrator';

  const adminExists = await db.get("SELECT * FROM users WHERE role = 'ADMIN' OR username = ? LIMIT 1", [adminUsername]);
  if (!adminExists) {
    const adminHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    await db.run(
      `INSERT INTO users (id, username, name, role, designation, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      ['u1', adminUsername, adminName, 'ADMIN', 'System Admin', adminHash]
    );
    console.log("[INIT] Default admin seeded");
  }

  // Developer access seed (Pull developer credentials from environment)
  const devEmail = process.env.DEFAULT_DEVELOPER_EMAIL || 'gamervibes1240@gmail.com';
  const devCode = process.env.DEFAULT_DEVELOPER_ACCESS_CODE || 'dev123';

  const devExists = await db.get("SELECT * FROM developer_access WHERE email = ?", [devEmail]);
  if (!devExists) {
    const codeHash = await bcrypt.hash(devCode, SALT_ROUNDS);
    await db.run(
      "INSERT INTO developer_access (email, access_code_hash) VALUES (?, ?)",
      [devEmail, codeHash]
    );
    console.log("[INIT] Developer account seeded");
  }

  // Developer config seed (Exclude SMTP secrets)
  const devConfig = await db.get('SELECT * FROM developer_config WHERE id = 1');
  if (!devConfig) {
    await db.run(`
      INSERT INTO developer_config (id, developer_email)
      VALUES (?, ?)
    `, [1, devEmail]);
    console.log("[INIT] Developer config seeded");
  }

  // Developer security code
  const devSec = await db.get('SELECT * FROM developer_security WHERE key = ?', ['dev_access_code']);
  if (!devSec) {
    const targetHash = await bcrypt.hash(devCode, SALT_ROUNDS);
    await db.run('INSERT INTO developer_security (key, value_hash) VALUES (?, ?)', ['dev_access_code', targetHash]);
    console.log("[INIT] Developer security seeded");
  }

  // Clinic profile default seed
  const clinicExists = await db.get('SELECT * FROM clinic_profile WHERE id = 1');
  if (!clinicExists) {
    await db.run(`
      INSERT INTO clinic_profile (id, clinic_name, hospital_name, logo, address, city, state, pincode, phone, email, website, gst_number, registration_number, letterhead_enabled, footer_text)
      VALUES (1, 'MEDFLOW HOSPITAL', 'SHREE AROGYALAYA HOSPITAL', '', '123, Health Avenue', 'Mumbai', 'Maharashtra', '400001', '+91 98765 43210', 'email@domain.com', 'www.domain.com', '', '', 1, 'Thank you for choosing us.')
    `);
    console.log("[INIT] Default clinic profile seeded");
  }

  // Medicines seed
  const med = await db.get('SELECT * FROM medicines LIMIT 1');
  if (!med) {
    const meds = [
      ['m1', 'Paracetamol 500mg', 'TAB', 'PARA01'],
      ['m2', 'Amoxicillin 500mg', 'CAP', 'AMOX01'],
      ['m3', 'Cough Syrup (Ascoril)', 'SYRP', 'COGH01'],
      ['m4', 'Pantoprazole 40mg', 'TAB', 'PANT01'],
      ['m5', 'Diclofenac Gel', 'OINT', 'DICL01'],
      ['m6', 'Cetirizine 10mg', 'TAB', 'CETI01'],
      ['m7', 'Azithromycin 500mg', 'TAB', 'AZIT01'],
      ['m8', 'Metformin 500mg', 'TAB', 'METF01'],
      ['m9', 'Amlodipine 5mg', 'TAB', 'AMLO01'],
      ['m10', 'Omeprazole 20mg', 'CAP', 'OMEP01']
    ];
    for (const m of meds) {
      await db.run('INSERT INTO medicines (id, name, type, code) VALUES (?, ?, ?, ?)', m);
    }
  }

  // Roles seed
  const role = await db.get('SELECT * FROM roles LIMIT 1');
  if (!role) {
    const roles = [
      ['r1', 'Administrator', 'ADMIN'],
      ['r2', 'Receptionist', 'RECEPTIONIST'],
      ['r3', 'Consultant', 'DOCTOR']
    ];
    for (const r of roles) {
      await db.run('INSERT INTO roles (id, name, type) VALUES (?, ?, ?)', r);
    }
  }

  // Master defaults seed
  const masterDefaults = [
    ['totalPatientLimit', 0],
    ['enablePatientLimit', true],
    ['enableStaffManagement', true],
    ['enableDiscount', true],
    ['enableGst', true],
    ['gstRate', 18],
    ['paymentModes', ['CASH', 'UPI', 'CARD', 'NET_BANKING']],
    ['doctorRoles', [
      'General Physician', 'Dentist', 'Physiotherapist', 'Surgeon', 'Pediatrician', 
      'Gynecologist', 'Dermatologist', 'ENT Specialist', 'Ophthalmologist', 'Orthopedic',
      'Cardiologist', 'Neurologist', 'Psychiatrist', 'Urologist', 'Radiologist'
    ]],
    ['paymentBy', ['Self', 'Insurance', 'Company', 'Government Scheme', 'Trust']],
    ['referredBy', ['Self', 'Family', 'Doctor', 'Friends', 'Neighbours', 'Consultant', 'Old Patient', 'Outreach Program', 'Social Media']],
    ['purposeOfVisit', [
      'Consultation', 'Fever', 'Checkup', 'Follow-up', 'Report Review', 
      'Emergency', 'Vaccination', 'Surgery', 'Diagnostic Test', 'Counseling'
    ]],
    ['idProofs', ['Aadhar Card', 'PAN Card', 'Driving License', 'Passport', 'Voter ID', 'Ration Card']],
    ['clinicName', 'MEDFLOW HOSPITAL'],
    ['clinicAddress', 'Clinic Address'],
    ['clinicContact', 'Contact Info'],
    ['medicineTypes', [
      'Tablet', 'Capsule', 'Powder', 'Granules', 'Lozenge', 'Syrup', 'Suspension', 'Solution', 'Drops',
      'Ointment', 'Cream', 'Gel', 'Paste', 'Suppository', 'Pessary', 'Inhaler', 'Nebulizer solution',
      'Injection', 'Infusion', 'Transdermal patch', 'Spray', 'Churna', 'Vati', 'Kwath', 'Asava',
      'Arishta', 'Avaleha', 'Ghrita', 'Taila', 'Bhasma', 'Pishti', 'Satva', 'Arka', 'Lepa', 'Anjana',
      'Nasya', 'Dhoop'
    ]],
    ['billParticulars', [
      { name: 'General Consultation', defaultRate: 500 },
      { name: 'Specialist Consultation', defaultRate: 1000 },
      { name: 'Follow-up Visit', defaultRate: 300 },
      { name: 'Emergency Consultation', defaultRate: 1500 },
      { name: 'Injection Charges', defaultRate: 50 },
      { name: 'Dressing Small', defaultRate: 100 },
      { name: 'Dressing Large', defaultRate: 250 },
      { name: 'Nebulization', defaultRate: 150 },
      { name: 'ECG', defaultRate: 500 },
      { name: 'Blood Glucose (RBS)', defaultRate: 50 }
    ]],
    ['statesAndCities', {
      "Andaman and Nicobar Islands": ["Port Blair"],
      "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry", "Tirupati", "Anantapur", "Kadapa", "Kakinada"],
      "Arunachal Pradesh": ["Itanagar", "Tawang", "Ziro"],
      "Assam": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Nagaon", "Tinsukia"],
      "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", "Bihar Sharif", "Arrah", "Begusarai"],
      "Chandigarh": ["Chandigarh"],
      "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Rajnandgaon"],
      "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
      "Delhi": ["New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi"],
      "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
      "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Gandhinagar", "Anand", "Navsari"],
      "Haryana": ["Faridabad", "Gurugram", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat"],
      "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi"],
      "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla"],
      "Jharkhand": ["Jamshedpur", "Dhanbad", "Ranchi", "Bokaro Steel City", "Deoghar", "Phusro"],
      "Karnataka": ["Bengaluru", "Hubballi-Dharwad", "Mysuru", "Kalaburagi", "Mangaluru", "Belagavi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga"],
      "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", "Alappuzha", "Palakkad", "Malappuram"],
      "Ladakh": ["Leh", "Kargil"],
      "Lakshadweep": ["Kavaratti"],
      "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa"],
      "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Pimpri-Chinchwad", "Nashik", "Kalyan-Dombivli", "Vasai-Virar", "Aurangabad", "Navi Mumbai", "Solapur", "Mira-Bhayandar", "Bhiwandi", "Amravati", "Nanded", "Kolhapur", "Akola", "Panvel", "Ulhasnagar", "Sangli", "Malegaon", "Jalgaon", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Ambarnath", "Bhusawal", "Panvel", "Badlapur", "Beed", "Gondia", "Satara", "Barshi", "Yavatmal", "Osmanabad", "Nandurbar", "Wardha", "Udgir", "Hinganghat"],
      "Manipur": ["Imphal"],
      "Meghalaya": ["Shillong", "Tura"],
      "Mizoram": ["Aizawl"],
      "Nagaland": ["Kohima", "Dimapur"],
      "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore"],
      "Puducherry": ["Puducherry", "Ozhukarai"],
      "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Hoshiarpur"],
      "Rajasthan": ["Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Udaipur", "Bhilwara", "Alwar", "Bharatpur", "Sikar"],
      "Sikkim": ["Gangtok"],
      "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Ambattur", "Tiruppur", "Avadi", "Erode"],
      "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam", "Mahabubnagar"],
      "Tripura": ["Agartala"],
      "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Meerut", "Varanasi", "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Noida", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura", "Ayodhya", "Rampur", "Shahjahanpur"],
      "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Kashipur"],
      "West Bengal": ["Kolkata", "Howrah", "Asansol", "Siliguri", "Durgapur", "Maheshtala", "Rajpur Sonarpur", "Gopalpur", "Bhatpara", "Panihati"]
    }]
  ];

  for (const [key, value] of masterDefaults) {
    const exists = await db.get('SELECT key FROM master_data WHERE key = ?', [key]);
    if (!exists) {
      await db.run('INSERT INTO master_data (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    }
  }

  // Subscription seed
  const sub = await db.get('SELECT * FROM subscription WHERE id = 1');
  if (!sub) {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const endDate = nextMonth.toISOString().split('T')[0];
    await db.run(`
      INSERT INTO subscription (id, is_lifetime, start_date, end_date, last_checked_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [1, 0, today, endDate, today, 'ACTIVE']);
    console.log("[INIT] Subscription seeded (Lifetime: OFF)");
  }
}

module.exports = {
  getDB,
  initDB,
  getJwtSecret,
  DB_PATH,
  storagePath,
  pool,
  convertQuery,
  logAudit,
  SALT_ROUNDS
};
