const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { getDB, pool, convertQuery } = require('../database');

// Configure Multer for file upload
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const upload = multer({ dest: UPLOADS_DIR });

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Import Database (from SQLite file upload to Supabase PostgreSQL)
router.post('/import', upload.single('database'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const importPath = req.file.path;
    let importDb = null;
    let pgClient = null;

    try {
        // Open the uploaded SQLite database
        importDb = await open({
            filename: importPath,
            driver: sqlite3.Database
        });

        // Checkout PostgreSQL client from pool for transaction isolation
        pgClient = await pool.connect();
        await pgClient.query('BEGIN');

        // Helper mock representing the transaction client
        const txDb = {
            async get(sql, params = []) {
                const res = await pgClient.query(convertQuery(sql), params);
                return res.rows[0];
            },
            async run(sql, params = []) {
                let converted = convertQuery(sql);
                const isInsert = converted.trim().toUpperCase().startsWith('INSERT');
                if (isInsert && !/returning/i.test(converted)) {
                    converted += ' RETURNING *';
                }
                const res = await pgClient.query(converted, params);
                let lastID = null;
                if (isInsert && res.rows && res.rows.length > 0) {
                    const row = res.rows[0];
                    lastID = row.id || row.billno || row.uhid || row.key || Object.values(row)[0];
                }
                return { lastID, changes: res.rowCount };
            }
        };

        // Mappings for ID conflicts
        const uhidMap = {}; // oldUHID -> newUHID
        const visitIdMap = {}; // oldVisitID -> newVisitID

        // --- 1. Migrate Patients ---
        const importedPatients = await importDb.all('SELECT * FROM patients');
        for (const p of importedPatients) {
            // Check if patient exists in PostgreSQL
            const existing = await txDb.get('SELECT uhid FROM patients WHERE uhid = $1', [p.uhid]);

            let newUhid = p.uhid;
            if (existing) {
                const suffix = Math.floor(Math.random() * 10000);
                newUhid = `${p.uhid}_IMP${suffix}`;
                uhidMap[p.uhid] = newUhid;
            }

            await txDb.run(`INSERT INTO patients (
                uhid, date, userType, title, firstName, middleName, lastName, 
                birthDate, age, sex, address, state, city, taluka, mobile, email,
                referredBy, paymentBy, consultantName, idProofType, idProofNumber, purposeOfVisit, visitCount, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newUhid, p.date, p.userType, p.title, p.firstName, p.middleName, p.lastName,
                p.birthDate, p.age, p.sex, p.address, p.state, p.city, p.taluka, p.mobile, p.email,
                p.referredBy, p.paymentBy, p.consultantName, p.idProofType, p.idProofNumber, p.purposeOfVisit, p.visitCount, p.createdAt || new Date().toISOString()
            ]);
        }

        // --- 2. Migrate Visits ---
        const importedVisits = await importDb.all('SELECT * FROM visits');
        for (const v of importedVisits) {
            const targetUhid = uhidMap[v.uhid] || v.uhid;

            const result = await txDb.run(`INSERT INTO visits (
                uhid, date, visitCount, complaint, history, findings, investigation, 
                diagnosis, actionPlan, treatment, advice, instruction, 
                bp, temp, spo2, pulse, height, weight, bmi, printSettings, nextVisitDate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                targetUhid, v.date, v.visitCount, v.complaint, v.history, v.findings, v.investigation,
                v.diagnosis, v.actionPlan, v.treatment, v.advice, v.instruction,
                v.bp, v.temp, v.spo2, v.pulse, v.height, v.weight, v.bmi, v.printSettings, v.nextVisitDate || ''
            ]);

            visitIdMap[v.id] = result.lastID;
        }

        // --- 3. Migrate Prescriptions ---
        const importedPrescriptions = await importDb.all('SELECT * FROM prescriptions');
        for (const pr of importedPrescriptions) {
            const targetUhid = uhidMap[pr.uhid] || pr.uhid;
            const targetVisitId = visitIdMap[pr.visit_id] || pr.visit_id;

            await txDb.run(`INSERT INTO prescriptions (
                visit_id, uhid, medicineName, type, dosage, instruction, days, date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                targetVisitId, targetUhid, pr.medicineName, pr.type, pr.dosage, pr.instruction, pr.days, pr.date
            ]);
        }

        // --- 4. Migrate Bills ---
        const importedBills = await importDb.all('SELECT * FROM bills');
        for (const b of importedBills) {
            const targetUhid = uhidMap[b.uhid] || b.uhid;

            let billNo = b.billNo;
            const existingBill = await txDb.get('SELECT billNo FROM bills WHERE billNo = $1', [billNo]);
            if (existingBill) {
                billNo = `${billNo}-IMP${Math.floor(Math.random() * 1000)}`;
            }

            await txDb.run(`INSERT INTO bills (
                billNo, uhid, patientName, date, consultant, total, paymentMode, 
                discountType, discountValue, visitCount, items, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                billNo, targetUhid, b.patientName, b.date, b.consultant, b.total, b.paymentMode,
                b.discountType, b.discountValue, b.visitCount, b.items, b.createdAt
            ]);
        }

        // --- 5. Migrate Medicines ---
        const importedMeds = await importDb.all('SELECT * FROM medicines');
        for (const m of importedMeds) {
            await txDb.run(`INSERT INTO medicines (id, name, type, code) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
                [m.id, m.name, m.type, m.code]);
        }

        // --- 6. Migrate Clinic Profile ---
        try {
            const importedProfiles = await importDb.all('SELECT * FROM clinic_profile');
            for (const cp of importedProfiles) {
                await txDb.run(`
                    INSERT INTO clinic_profile (
                        id, clinic_name, hospital_name, logo, address, city, state, pincode, phone, email, website, gst_number, registration_number, letterhead_enabled, footer_text
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        clinic_name = excluded.clinic_name,
                        hospital_name = excluded.hospital_name,
                        logo = excluded.logo,
                        address = excluded.address,
                        city = excluded.city,
                        state = excluded.state,
                        pincode = excluded.pincode,
                        phone = excluded.phone,
                        email = excluded.email,
                        website = excluded.website,
                        gst_number = excluded.gst_number,
                        registration_number = excluded.registration_number,
                        letterhead_enabled = excluded.letterhead_enabled,
                        footer_text = excluded.footer_text
                `, [
                    cp.clinic_name || cp.clinicName || '', cp.hospital_name || cp.hospitalName || '', cp.logo || '', cp.address || '', cp.city || '', cp.state || '', cp.pincode || '',
                    cp.phone || '', cp.email || '', cp.website || '', cp.gst_number || '', cp.registration_number || '', cp.letterhead_enabled !== undefined ? cp.letterhead_enabled : 1, cp.footer_text || ''
                ]);
            }
        } catch (profileErr) {
            console.warn("Skipping legacy clinic profile import:", profileErr.message);
        }

        await pgClient.query('COMMIT');

        // Cleanup
        await importDb.close();
        if (fs.existsSync(importPath)) fs.unlinkSync(importPath);

        res.json({
            message: 'Database imported successfully',
            details: {
                patients: importedPatients.length,
                visits: importedVisits.length,
                conflictsResolved: Object.keys(uhidMap).length
            }
        });

    } catch (e) {
        if (importDb) await importDb.close();
        if (fs.existsSync(importPath)) fs.unlinkSync(importPath);

        if (pgClient) {
            await pgClient.query('ROLLBACK');
        }

        console.error('Import Failed:', e);
        res.status(500).json({ error: 'Import Failed: ' + e.message });
    } finally {
        if (pgClient) {
            pgClient.release();
        }
    }
});

// 2. Export Database (Generates a local SQLite file on-the-fly from Supabase PostgreSQL tables)
router.get('/export', async (req, res) => {
    const exportPath = path.join(process.cwd(), `export-${Date.now()}.sqlite`);
    let exportDb = null;

    try {
        // Initialize temporary SQLite file schema
        exportDb = await open({
            filename: exportPath,
            driver: sqlite3.Database
        });

        await exportDb.exec(`
            CREATE TABLE patients (
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
            
            CREATE TABLE visits (
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
              printSettings TEXT,
              nextVisitDate TEXT
            );
            
            CREATE TABLE prescriptions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              visit_id INTEGER,
              uhid TEXT NOT NULL,
              medicineName TEXT,
              type TEXT,
              dosage TEXT,
              instruction TEXT,
              days INTEGER,
              date TEXT
            );
            
            CREATE TABLE bills (
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
              items TEXT,
              createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE medicines (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              type TEXT,
              code TEXT
            );

            CREATE TABLE clinic_profile (
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
              footer_text TEXT
            );
        `);

        const mainDb = await getDB();

        // 1. Export Patients
        const patients = await mainDb.all('SELECT * FROM patients');
        for (const p of patients) {
            await exportDb.run(`INSERT INTO patients (
                uhid, date, userType, title, firstName, middleName, lastName, 
                birthDate, age, sex, address, state, city, taluka, mobile, email,
                referredBy, paymentBy, consultantName, idProofType, idProofNumber, purposeOfVisit, visitCount, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                p.uhid, p.date, p.userType, p.title, p.firstName, p.middleName, p.lastName,
                p.birthDate, p.age, p.sex, p.address, p.state, p.city, p.taluka, p.mobile, p.email,
                p.referredBy, p.paymentBy, p.consultantName, p.idProofType, p.idProofNumber, p.purposeOfVisit, p.visitCount, p.createdAt
            ]);
        }

        // 2. Export Visits
        const visits = await mainDb.all('SELECT * FROM visits');
        for (const v of visits) {
            await exportDb.run(`INSERT INTO visits (
                id, uhid, date, visitCount, complaint, history, findings, investigation, 
                diagnosis, actionPlan, treatment, advice, instruction, bp, temp, spo2, pulse, height, weight, bmi, printSettings, nextVisitDate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                v.id, v.uhid, v.date, v.visitCount, v.complaint, v.history, v.findings, v.investigation,
                v.diagnosis, v.actionPlan, v.treatment, v.advice, v.instruction, v.bp, v.temp, v.spo2, v.pulse, v.height, v.weight, v.bmi, v.printSettings, v.nextVisitDate
            ]);
        }

        // 3. Export Prescriptions
        const prescriptions = await mainDb.all('SELECT * FROM prescriptions');
        for (const pr of prescriptions) {
            await exportDb.run(`INSERT INTO prescriptions (
                id, visit_id, uhid, medicineName, type, dosage, instruction, days, date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                pr.id, pr.visit_id, pr.uhid, pr.medicineName, pr.type, pr.dosage, pr.instruction, pr.days, pr.date
            ]);
        }

        // 4. Export Bills
        const bills = await mainDb.all('SELECT * FROM bills');
        for (const b of bills) {
            await exportDb.run(`INSERT INTO bills (
                billNo, uhid, patientName, date, consultant, total, paymentMode, discountType, discountValue, visitCount, items, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                b.billNo, b.uhid, b.patientName, b.date, b.consultant, b.total, b.paymentMode, b.discountType, b.discountValue, b.visitCount, b.items, b.createdAt
            ]);
        }

        // 5. Export Medicines
        const medicines = await mainDb.all('SELECT * FROM medicines');
        for (const m of medicines) {
            await exportDb.run(`INSERT INTO medicines (id, name, type, code) VALUES (?, ?, ?, ?)`,
                [m.id, m.name, m.type, m.code]);
        }

        // 6. Export Clinic Profile
        const profiles = await mainDb.all('SELECT * FROM clinic_profile');
        for (const cp of profiles) {
            await exportDb.run(`
                INSERT INTO clinic_profile (
                    id, clinic_name, hospital_name, logo, address, city, state, pincode, phone, email, website, gst_number, registration_number, letterhead_enabled, footer_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                cp.id, cp.clinic_name || '', cp.hospital_name || '', cp.logo || '', cp.address || '', cp.city || '', cp.state || '', cp.pincode || '',
                cp.phone || '', cp.email || '', cp.website || '', cp.gst_number || '', cp.registration_number || '', cp.letterhead_enabled || 1, cp.footer_text || ''
            ]);
        }

        await exportDb.close();

        res.download(exportPath, 'clinic_backup.sqlite', (err) => {
            if (fs.existsSync(exportPath)) {
                fs.unlinkSync(exportPath);
            }
        });

    } catch (e) {
        if (exportDb) await exportDb.close();
        if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
        console.error('Export Failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// 3. Wipe Database (Clear Patient Data in isolated Transaction)
router.post('/delete', async (req, res) => {
    let pgClient = null;
    try {
        pgClient = await pool.connect();
        await pgClient.query('BEGIN');

        // Capture counts for logging (before deletion)
        const counts = {
            bills: (await pgClient.query('SELECT COUNT(*) as c FROM bills')).rows[0].c,
            prescriptions: (await pgClient.query('SELECT COUNT(*) as c FROM prescriptions')).rows[0].c,
            visits: (await pgClient.query('SELECT COUNT(*) as c FROM visits')).rows[0].c,
            patients: (await pgClient.query('SELECT COUNT(*) as c FROM patients')).rows[0].c
        };

        // Delete from all patient-related tables in PostgreSQL
        await pgClient.query('DELETE FROM bills');
        await pgClient.query('DELETE FROM prescriptions');
        await pgClient.query('DELETE FROM visits');
        await pgClient.query('DELETE FROM patients');

        await pgClient.query('COMMIT');

        // Log database wipe audit
        await logAudit(req, 'DEVELOPER_CHANGES', 'DATABASE', 'Wiped all patient records in database', 'DEV', 'developer', 'DEVELOPER');

        console.log(`[Database Wipe] Deleted: ${counts.patients} patients, ${counts.visits} visits, ${counts.bills} bills, ${counts.prescriptions} prescriptions.`);

        res.json({ 
            message: 'All patient data deleted successfully',
            details: {
                bills: parseInt(counts.bills),
                prescriptions: parseInt(counts.prescriptions),
                visits: parseInt(counts.visits),
                patients: parseInt(counts.patients)
            }
        });
    } catch (e) {
        console.error('Database Wipe Failed:', e);
        if (pgClient) {
            try {
                await pgClient.query('ROLLBACK');
            } catch (rollError) {
                console.error('Rollback failed:', rollError);
            }
        }
        res.status(500).json({ error: 'Wipe Failed: ' + e.message });
    } finally {
        if (pgClient) {
            pgClient.release();
        }
    }
});

module.exports = router;
