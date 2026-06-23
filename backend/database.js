const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const fs = require('fs');

// 1. Determine Persistent Storage Path
// Use Electron's official userData path when available, fallback to a local folder for dev/node
let storagePath;
let isElectron = false;
try {
    const electron = require('electron');
    const app = electron.app;
    if (app) {
        // Use AppData path directly to avoid differences due to electron app names
        storagePath = path.join(app.getPath('appData'), 'medflow-hms');
        isElectron = true;
    } else {
        // Fallback for running with plain 'node backend/server.js'
        storagePath = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 'medflow-hms');
    }
} catch (e) {
    // If require('electron') fails or app is not found
    storagePath = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 'medflow-hms');
}

// 2. Ensure storage directory exists
if (!fs.existsSync(storagePath)) {
    try {
        fs.mkdirSync(storagePath, { recursive: true });
    } catch (err) {
        console.error('Failed to create storage directory:', err);
    }
}

// 3. Define the permanent Database Path
const DB_PATH = process.env.MEDFLOW_DB_PATH || path.join(storagePath, 'database.sqlite');
const OLD_DB_PATH = path.join(__dirname, '..', 'database.sqlite');

// 4. Persistence Check: Migrate existing database if it exists in the old path
// This ensures "Existing users persist" requirement is met during transition
if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    console.log(`[DB] Migrating existing database from ${OLD_DB_PATH} to ${DB_PATH}`);
    try {
        fs.copyFileSync(OLD_DB_PATH, DB_PATH);
        console.log('[DB] Migration successful');
    } catch (err) {
        console.error('[DB] Migration failed:', err);
    }
}

// 5. Official Path Logging
console.log('===========================================');
console.log('       SQLITE DATABASE INITIALIZATION      ');
console.log('===========================================');
console.log('  Mode:         ', isElectron ? 'Electron Main Process' : 'Standalone Node.js');
console.log('  Storage Path: ', storagePath);
console.log('  Database:     ', DB_PATH);
console.log('===========================================');

const SALT_ROUNDS = 10;

let db;
let cachedJwtSecret = null;

async function getJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;
  if (!db) await getDB();
  const result = await db.get('SELECT jwt_secret FROM app_config WHERE id = 1');
  if (result) {
    cachedJwtSecret = result.jwt_secret;
    return cachedJwtSecret;
  }
  throw new Error('JWT Secret not initialized');
}

async function getDB() {
  if (db) return db;

  // Use absolute path for SQLite
  console.log(`Connecting to database at: ${DB_PATH}`);
  
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Set a busy timeout to wait for locks to clear (5 seconds)
  await db.exec('PRAGMA busy_timeout = 5000');

  // Enable WAL mode for better concurrency and fewer "Database is locked" errors
  await db.exec('PRAGMA journal_mode = WAL');

  return db;
}

async function initDB() {
  const db = await getDB();

  // Enable Foreign Keys
  await db.exec('PRAGMA foreign_keys = ON');

  // 1. Create Tables

  // Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL COLLATE NOCASE,
      designation TEXT,
      password_hash TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Security Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS developer_security (
      key TEXT PRIMARY KEY,
      value_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Patient Documents (Digilocker) Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS patient_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uhid TEXT NOT NULL,
      default_name TEXT NOT NULL,
      custom_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration / Schema Updates for existing installations
  const getColumns = async (tableName) => {
    const info = await db.all(`PRAGMA table_info(${tableName})`);
    return info.map(c => c.name);
  };

  let currentColumns = await getColumns('users');

  if (!currentColumns.includes('username')) {
    try {
      await db.exec(`ALTER TABLE users ADD COLUMN username TEXT`);
      await db.exec(`UPDATE users SET username = id WHERE username IS NULL`);
      await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
      console.log('Migrated username column');
      currentColumns = await getColumns('users');
    } catch (e) {
      console.warn("Migration warning (username):", e.message);
    }
  }

  if (!currentColumns.includes('password_hash')) {
    try {
      await db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);

      // Check if old 'pin' column exists and migrate
      if (currentColumns.includes('pin')) {
        const users = await db.all('SELECT id, pin FROM users');
        for (const u of users) {
          if (u.pin) {
            const hash = await bcrypt.hash(u.pin, SALT_ROUNDS);
            await db.run('UPDATE users SET password_hash = ?, pin = NULL WHERE id = ?', [hash, u.id]);
          }
        }
        console.log('Migrated PINs to hashed passwords');
      }
      currentColumns = await getColumns('users');
    } catch (e) { console.warn("Migration warning (password_hash):", e.message); }
  }

  // Legacy PIN cleanup: Drop the column if it exists to prevent NOT NULL constraints
  if (currentColumns.includes('pin')) {
    try {
      await db.exec('ALTER TABLE users DROP COLUMN pin');
      console.log('Dropped legacy "pin" column');
      currentColumns = await getColumns('users');
    } catch (e) {
      console.warn("Could not drop 'pin' column (might be needed by legacy, or SQLite version old):", e.message);
      // If we can't drop it, at least remove the NOT NULL constraint? 
      // SQLite doesn't support altering constraints easily.
      // We rely on the app to handle it or the DROP to work.
    }
  }

  if (!currentColumns.includes('is_active')) {
    try {
      await db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
      console.log('Added is_active column');
      currentColumns = await getColumns('users');
    } catch (e) { console.error("Migration error (is_active):", e.message); }
  }

  if (!currentColumns.includes('created_at')) {
    try {
      await db.exec(`ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`);
      console.log('Added created_at column');
    } catch (e) {
      console.error("Migration error (created_at):", e.message);
      try {
        await db.exec(`ALTER TABLE users ADD COLUMN created_at TEXT`);
        console.log('Added created_at (no default)');
      } catch (e2) {
        console.error("Critical Migration failure (created_at):", e2.message);
      }
    }
    currentColumns = await getColumns('users');
  }

  // Ensure all existing user roles are in UPPERCASE
  try {
    await db.exec("UPDATE users SET role = UPPER(role)");
    console.log('[DB] Migrated all user roles to UPPERCASE');
  } catch (e) {
    console.warn("[DB] Migration warning (uppercase roles):", e.message);
  }

  // Patients Table Migration
  const currentPatientsColumns = await getColumns('patients');
  if (!currentPatientsColumns.includes('visitCount')) {
    try {
      await db.exec(`ALTER TABLE patients ADD COLUMN visitCount INTEGER DEFAULT 0`);
      console.log('Added visitCount column to patients table');
    } catch (e) { console.error("Migration error (visitCount):", e.message); }
  }

  // Location and New Fields Migration
  const columnsToAdd = ['state', 'city', 'taluka', 'email', 'middleName', 'idProofNumber', 'idProofType', 'purposeOfVisit'];
  for (const col of columnsToAdd) {
    if (!currentPatientsColumns.includes(col)) {
      try {
        await db.exec(`ALTER TABLE patients ADD COLUMN ${col} TEXT`);
        console.log(`Added ${col} column to patients table`);
      } catch (e) { console.error(`Migration error (${col}):`, e.message); }
    }
  }

  const currentVisitsColumns = await getColumns('visits');
  if (!currentVisitsColumns.includes('nextVisitDate')) {
    try {
      await db.exec(`ALTER TABLE visits ADD COLUMN nextVisitDate TEXT`);
      console.log('Added nextVisitDate column to visits table');
    } catch (e) { console.error("Migration error (nextVisitDate):", e.message); }
  }

  // Patients Table
  await db.exec(`
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
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Visits (Clinical Data) Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uhid TEXT NOT NULL,
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
      printSettings TEXT, -- JSON string
      nextVisitDate TEXT,
      FOREIGN KEY(uhid) REFERENCES patients(uhid) ON DELETE CASCADE
    );
  `);

  // Doctor Page Settings Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS doctor_page_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id TEXT UNIQUE NOT NULL,
      paper_size TEXT DEFAULT 'A4',
      header_enabled INTEGER DEFAULT 1,
      margin_top_cm REAL DEFAULT 2.0,
      margin_left_cm REAL DEFAULT 2.0,
      margin_right_cm REAL DEFAULT 2.0,
      margin_bottom_cm REAL DEFAULT 2.0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(doctor_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrate any legacy A2 page size selections to A5
  try {
    await db.run("UPDATE doctor_page_settings SET paper_size = 'A5' WHERE paper_size = 'A2'");
  } catch (e) {
    console.warn("Migration warning (doctor_page_settings A2 to A5):", e.message);
  }

  // Prescriptions Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER,
      uhid TEXT NOT NULL,
      medicineName TEXT,
      type TEXT,
      dosage TEXT,
      instruction TEXT,
      days INTEGER,
      date TEXT,
      FOREIGN KEY(visit_id) REFERENCES visits(id) ON DELETE CASCADE,
      FOREIGN KEY(uhid) REFERENCES patients(uhid) ON DELETE CASCADE
    );
  `);

  // Medicines Master Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      code TEXT
    );
  `);

  // Bills Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      billNo TEXT PRIMARY KEY,
      uhid TEXT,
      patientName TEXT,
      date TEXT,
      consultant TEXT,
      total REAL,
      paymentMode TEXT,
      discountType TEXT,
      discountValue REAL,
      visitCount INTEGER,
      items TEXT, -- JSON Array of BillItem
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(uhid) REFERENCES patients(uhid) ON DELETE SET NULL
    );
  `);

  // Master Data
  await db.exec(`
    CREATE TABLE IF NOT EXISTS master_data (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Roles Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT
    );
  `);

  // Subscription Table (Only one row allowed)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscription (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_lifetime INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      last_checked_date TEXT,
      status TEXT DEFAULT 'ACTIVE',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Configuration Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS developer_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      developer_email TEXT NOT NULL,
      admin_email TEXT,
      gmail_user TEXT,
      gmail_pass_encrypted TEXT
    );
  `);

  // Developer OTP Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS developer_otp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      otp_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Developer Sessions Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS developer_sessions (
      token TEXT PRIMARY KEY,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // App Config Table (For Secure JWT Secret)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      jwt_secret TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration for subscription table
  const subColumns = await db.all("PRAGMA table_info(subscription)");
  const subColumnNames = subColumns.map(c => c.name);
  if (!subColumnNames.includes('status')) {
    try {
      await db.exec(`ALTER TABLE subscription ADD COLUMN status TEXT DEFAULT 'ACTIVE'`);
    } catch (e) { console.warn("Migration warning (subscription status):", e.message); }
  }

  // Migration for developer_config table
  const devConfigColumns = await db.all("PRAGMA table_info(developer_config)");
  const devConfigColumnNames = devConfigColumns.map(c => c.name);
  if (!devConfigColumnNames.includes('admin_email')) {
    try {
      await db.exec(`ALTER TABLE developer_config ADD COLUMN admin_email TEXT`);
      console.log('Added admin_email column to developer_config');
    } catch (e) { console.warn("Migration warning (developer_config admin_email):", e.message); }
  }

  // Seed Initial Data if empty
  await seedData(db);

  // Purge: If a patient has 0 visits in the visits table, delete the patient record entirely
  // Using NOT EXISTS for safety against potential NULL uhids in visits table
  await db.exec(`
    DELETE FROM patients
    WHERE NOT EXISTS (
      SELECT 1 FROM visits WHERE visits.uhid = patients.uhid
    )
  `);
  // Fix-up: Sync visitCount for ALL patients
  // This ensures accuracy for everyone in the system
  await db.exec(`
    UPDATE patients
    SET visitCount = (
      SELECT COALESCE(COUNT(*), 0)
      FROM visits
      WHERE visits.uhid = patients.uhid
    )
  `);

  // Fix-up: Ensure all DOCTORs have 'Dr.' prefix in Name
  const allDocs = await db.all("SELECT id, name FROM users WHERE role = 'DOCTOR'");
  for (const doc of allDocs) {
    let name = doc.name.trim();
    if (!name.toLowerCase().startsWith('dr.') && !name.toLowerCase().startsWith('dr ')) {
      const newName = `Dr. ${name}`;
      await db.run("UPDATE users SET name = ? WHERE id = ?", [newName, doc.id]);
      await db.run("UPDATE patients SET consultantName = ? WHERE consultantName = ?", [newName, name]);
      await db.run("UPDATE bills SET consultant = ? WHERE consultant = ?", [newName, name]);
      console.log(`Updated doctor name: ${name} -> ${newName}`);
    } else if (name.toLowerCase().startsWith('dr ')) {
      const newName = `Dr. ${name.substring(3).trim()}`;
      await db.run("UPDATE users SET name = ? WHERE id = ?", [newName, doc.id]);
      await db.run("UPDATE patients SET consultantName = ? WHERE consultantName = ?", [newName, name]);
      await db.run("UPDATE bills SET consultant = ? WHERE consultant = ?", [newName, name]);
    }
  }

  // Auto-Assign Orphaned Records: If only ONE doctor exists, assign all mystery-doctor patients to them
  const finalDocs = await db.all("SELECT name FROM users WHERE role = 'DOCTOR'");
  if (finalDocs.length === 1) {
    const mainDoc = finalDocs[0].name;
    await db.run("UPDATE patients SET consultantName = ? WHERE consultantName NOT IN (SELECT name FROM users WHERE role = 'DOCTOR')", [mainDoc]);
    await db.run("UPDATE bills SET consultant = ? WHERE consultant NOT IN (SELECT name FROM users WHERE role = 'DOCTOR')", [mainDoc]);
    console.log(`Auto-assigned orphaned records to: ${mainDoc}`);
  }

  console.log('Database initialized successfully');
}

async function seedData(db) {
  // Check Users: During database initialization, automatically check if an admin user exists.
  // Query: SELECT * FROM users WHERE role='admin' LIMIT 1
  const adminExists = await db.get("SELECT * FROM users WHERE role='admin' LIMIT 1");
  const adminExistsUpper = await db.get("SELECT * FROM users WHERE role='ADMIN' LIMIT 1");
  const adminExistsUser = await db.get("SELECT * FROM users WHERE username='admin' OR id='u1' LIMIT 1");

  if (adminExists || adminExistsUpper || adminExistsUser) {
    console.log("[INIT] Admin user already exists");
  } else {
    const adminPass = '$Medflow989200';
    const adminHash = await bcrypt.hash(adminPass, 10);
    // Create admin user: behave exactly like a manually created admin.
    await db.run(
      `INSERT INTO users (id, username, name, role, designation, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      ['u1', 'admin', 'Administrator', 'ADMIN', 'System Admin', adminHash]
    );
    console.log("[INIT] Default admin created successfully");
  }

  // Developer Access Table Creation & Seeding
  await db.exec(`
    CREATE TABLE IF NOT EXISTS developer_access (
      email TEXT UNIQUE,
      access_code_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const devExists = await db.get("SELECT * FROM developer_access WHERE email = ?", ['gamervibes1240@gmail.com']);
  if (devExists) {
    // Already present
  } else {
    const defaultDevCode = 'dev123';
    const codeHash = await bcrypt.hash(defaultDevCode, 10);
    await db.run(
      "INSERT INTO developer_access (email, access_code_hash) VALUES (?, ?)",
      ['gamervibes1240@gmail.com', codeHash]
    );
    console.log("[INIT] Developer account seeded successfully");
  }

  // Also check and seed developer_config for application/mailer compatibility
  const devConfig = await db.get('SELECT * FROM developer_config WHERE id = 1');
  if (!devConfig) {
    const emailUser = 'gamervibes1240@gmail.com';
    const emailPass = 'zittlysbwekosjke';
    const encrypt = (text) => Buffer.from(text).toString('base64');

    await db.run(`
      INSERT INTO developer_config (id, developer_email, gmail_user, gmail_pass_encrypted)
      VALUES (?, ?, ?, ?)
    `, [1, 'gamervibes1240@gmail.com', emailUser, encrypt(emailPass)]);
    console.log("Seeded developer configuration.");
  }

  // Developer Security Code (fallback for legacy components)
  const devSec = await db.get('SELECT * FROM developer_security WHERE key = ?', ['dev_access_code']);
  if (!devSec) {
    const defaultDevCode = 'dev123';
    const targetHash = await bcrypt.hash(defaultDevCode, SALT_ROUNDS);
    await db.run('INSERT INTO developer_security (key, value_hash) VALUES (?, ?)', ['dev_access_code', targetHash]);
    console.log(`Seeded developer access security entry.`);
  }



  // Check Medicines
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

  // Check Roles
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

  // Seed Default Master Data - COMPREHENSIVE SEED to prevent frontend crashes
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
      "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Pimpri-Chinchwad", "Nashik", "Kalyan-Dombivli", "Vasai-Virar", "Aurangabad", "Navi Mumbai", "Solapur", "Mira-Bhayandar", "Bhiwandi", "Amravati", "Nanded", "Kolhapur", "Akola", "Panvel", "Ulhasnagar", "Sangli", "Malegaon", "Jalgaon", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Ambarnath", "Bhusawal", "Panvel", "Badlapur", "Beed", "Gondia", "Satara", "Barshi", "Yavatmal", "Achalpur", "Osmanabad", "Nandurbar", "Wardha", "Udgir", "Hinganghat"],
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
      console.log(`Seeded Master Setting: ${key}`);
    }
  }

  // Check Subscription
  const sub = await db.get('SELECT * FROM subscription WHERE id = 1');
  if (!sub) {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const endDate = nextMonth.toISOString().split('T')[0];

    // Seed with Lifetime Access = 1 (ON) by default as requested
    await db.run(`
      INSERT INTO subscription (id, is_lifetime, start_date, end_date, last_checked_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [1, 1, today, endDate, today, 'ACTIVE']);
    console.log(`Seeded initial subscription (Lifetime: ON).`);
  }

  // Check App Config (JWT Secret)
  const appConfig = await db.get('SELECT * FROM app_config WHERE id = 1');
  if (!appConfig) {
    const secret = crypto.randomBytes(64).toString('hex');
    await db.run('INSERT INTO app_config (id, jwt_secret) VALUES (?, ?)', [1, secret]);
    cachedJwtSecret = secret;
    console.log('Generatred and stored secure persistent JWT Secret.');
  } else {
    cachedJwtSecret = appConfig.jwt_secret;
    console.log('Loaded secure JWT Secret from database.');
  }
}



module.exports = {
  getDB,
  initDB,
  getJwtSecret,
  DB_PATH,
  storagePath
};

