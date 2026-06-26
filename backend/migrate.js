const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const pg = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Error: DATABASE_URL environment variable is missing in process.env.");
  process.exit(1);
}

// Locate SQLite database in root workspace or backend folder
const possiblePaths = [
  path.join(__dirname, 'database.sqlite'),
  path.join(__dirname, '..', 'database.sqlite'),
  path.join(__dirname, 'clinic.sqlite'),
  path.join(__dirname, '..', 'clinic.sqlite')
];

let sqlitePath = null;
for (const p of possiblePaths) {
  if (require('fs').existsSync(p)) {
    sqlitePath = p;
    break;
  }
}

if (!sqlitePath) {
  console.error("Error: Could not locate SQLite database file (database.sqlite or clinic.sqlite).");
  process.exit(1);
}

console.log(`Connecting to SQLite database at: ${sqlitePath}`);
console.log(`Connecting to PostgreSQL database...`);

async function migrate() {
  let sqliteDb;
  let pgPool;
  let pgClient;
  
  try {
    sqliteDb = await open({
      filename: sqlitePath,
      driver: sqlite3.Database
    });
    
    pgPool = new pg.Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    pgClient = await pgPool.connect();
    
    console.log("Migration started...");
    
    // Helper function to insert into PG
    async function insertIntoPg(table, columns, rows) {
      if (rows.length === 0) return;
      console.log(`Migrating ${rows.length} rows for table: ${table}...`);
      
      const colList = columns.join(', ');
      const valPlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${table} (${colList}) VALUES (${valPlaceholders}) ON CONFLICT DO NOTHING`;
      
      for (const row of rows) {
        const vals = columns.map(col => {
          const val = row[col];
          return val;
        });
        await pgClient.query(query, vals);
      }
    }
    
    // 1. users
    const users = await sqliteDb.all('SELECT * FROM users');
    await insertIntoPg('users', ['id', 'username', 'name', 'role', 'designation', 'password_hash', 'is_active', 'created_at'], users);
    
    // 2. developer_security
    const devSec = await sqliteDb.all('SELECT * FROM developer_security');
    await insertIntoPg('developer_security', ['key', 'value_hash', 'created_at'], devSec);
    
    // 3. developer_access
    const devAcc = await sqliteDb.all('SELECT * FROM developer_access');
    await insertIntoPg('developer_access', ['email', 'access_code_hash', 'created_at'], devAcc);

    // 4. developer_config
    const devConf = await sqliteDb.all('SELECT * FROM developer_config');
    await insertIntoPg('developer_config', ['id', 'developer_email', 'admin_email', 'gmail_user', 'gmail_pass_encrypted'], devConf);
    
    // 5. app_config
    const appConf = await sqliteDb.all('SELECT * FROM app_config');
    await insertIntoPg('app_config', ['id', 'jwt_secret', 'created_at'], appConf);
    
    // 6. medicines
    const meds = await sqliteDb.all('SELECT * FROM medicines');
    await insertIntoPg('medicines', ['id', 'name', 'type', 'code'], meds);
    
    // 7. roles
    const roles = await sqliteDb.all('SELECT * FROM roles');
    await insertIntoPg('roles', ['id', 'name', 'type'], roles);
    
    // 8. patients
    const patients = await sqliteDb.all('SELECT * FROM patients');
    await insertIntoPg('patients', [
      'uhid', 'date', 'userType', 'title', 'firstName', 'middleName', 'lastName',
      'birthDate', 'age', 'sex', 'address', 'state', 'city', 'taluka', 'mobile', 'email',
      'referredBy', 'paymentBy', 'consultantName', 'idProofType', 'idProofNumber', 'purposeOfVisit', 'visitCount', 'createdAt'
    ], patients);
    
    // 9. visits
    const visits = await sqliteDb.all('SELECT * FROM visits');
    await insertIntoPg('visits', [
      'id', 'uhid', 'date', 'visitCount', 'complaint', 'history', 'findings', 'investigation',
      'diagnosis', 'actionPlan', 'treatment', 'advice', 'instruction',
      'bp', 'temp', 'spo2', 'pulse', 'height', 'weight', 'bmi', 'printSettings', 'nextVisitDate'
    ], visits);
    
    // 10. prescriptions
    const prescriptions = await sqliteDb.all('SELECT * FROM prescriptions');
    await insertIntoPg('prescriptions', ['id', 'visit_id', 'uhid', 'medicineName', 'type', 'dosage', 'instruction', 'days', 'date'], prescriptions);
    
    // 11. bills
    const bills = await sqliteDb.all('SELECT * FROM bills');
    await insertIntoPg('bills', [
      'billNo', 'uhid', 'patientName', 'date', 'consultant', 'total', 'paymentMode', 'discountType', 'discountValue', 'visitCount', 'items', 'createdAt'
    ], bills);
    
    // 12. doctor_page_settings
    const docSettings = await sqliteDb.all('SELECT * FROM doctor_page_settings');
    await insertIntoPg('doctor_page_settings', ['id', 'doctor_id', 'paper_size', 'header_enabled', 'margin_top_cm', 'margin_left_cm', 'margin_right_cm', 'margin_bottom_cm', 'updated_at'], docSettings);
    
    // 13. patient_documents
    const patDocs = await sqliteDb.all('SELECT * FROM patient_documents');
    await insertIntoPg('patient_documents', ['id', 'uhid', 'default_name', 'custom_name', 'file_path', 'mime_type', 'file_size', 'created_at'], patDocs);
    
    // 14. developer_otp
    const devOtp = await sqliteDb.all('SELECT * FROM developer_otp');
    await insertIntoPg('developer_otp', ['id', 'otp_hash', 'expires_at', 'attempts', 'is_used', 'created_at'], devOtp);
    
    // 15. developer_sessions
    const devSess = await sqliteDb.all('SELECT * FROM developer_sessions');
    await insertIntoPg('developer_sessions', ['token', 'expires_at', 'created_at'], devSess);
    
    // 16. subscription
    const subs = await sqliteDb.all('SELECT * FROM subscription');
    await insertIntoPg('subscription', ['id', 'is_lifetime', 'start_date', 'end_date', 'last_checked_date', 'status', 'updated_at'], subs);

    // 17. master_data
    const masterData = await sqliteDb.all('SELECT * FROM master_data');
    await insertIntoPg('master_data', ['key', 'value'], masterData);

    // 18. clinic_profile
    try {
      const clinicProfiles = await sqliteDb.all('SELECT * FROM clinic_profile');
      await insertIntoPg('clinic_profile', [
        'id', 'clinic_name', 'hospital_name', 'logo', 'address', 'city', 'state', 'pincode',
        'phone', 'email', 'website', 'gst_number', 'registration_number', 'letterhead_enabled', 'footer_text'
      ], clinicProfiles);
    } catch (profileErr) {
      console.warn("Skipping clinic_profile migration (table might not exist in source database):", profileErr.message);
    }

    console.log("Migration completed successfully!");
    
    // Align serial key sequences for auto-increment columns in PostgreSQL
    const seqs = ['patient_documents', 'visits', 'prescriptions', 'doctor_page_settings', 'developer_otp'];
    for (const seq of seqs) {
      await pgClient.query(`SELECT setval(pg_get_serial_sequence('${seq}', 'id'), COALESCE(MAX(id), 1)) FROM ${seq}`);
    }
    console.log("PostgreSQL auto-increment sequences updated successfully.");
    
    pgPool.end();
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    if (sqliteDb) await sqliteDb.close();
    if (pgClient) pgClient.release();
  }
}

migrate();
