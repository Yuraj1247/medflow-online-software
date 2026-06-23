const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { getDB, DB_PATH } = require('../database');

// Configure Multer for file upload
// Configure Multer for file upload - USE process.cwd() for external storage
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const upload = multer({ dest: UPLOADS_DIR });

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Import Database
router.post('/import', upload.single('database'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const importPath = req.file.path;
    let importDb = null;

    try {
        const mainDb = await getDB();

        // Open the uploaded database
        importDb = await open({
            filename: importPath,
            driver: sqlite3.Database
        });

        // Start Transaction on Main DB
        await mainDb.exec('BEGIN TRANSACTION');

        // Mappings for ID conflicts
        const uhidMap = {}; // oldUHID -> newUHID
        const visitIdMap = {}; // oldVisitID -> newVisitID

        // --- 1. Migrate Patients ---
        const importedPatients = await importDb.all('SELECT * FROM patients');
        for (const p of importedPatients) {
            // Check if patient exists
            const existing = await mainDb.get('SELECT uhid FROM patients WHERE uhid = ?', [p.uhid]);

            let newUhid = p.uhid;
            if (existing) {
                // Conflict: Generate new UHID
                // Simple strategy: Append random suffix or timestamp
                const suffix = Math.floor(Math.random() * 10000);
                newUhid = `${p.uhid}_IMP${suffix}`;
                uhidMap[p.uhid] = newUhid; // Map old to new
            }

            // Insert into Main DB
            // We use the new UHID
            await mainDb.run(`INSERT INTO patients (
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
            // Resolve UHID
            const targetUhid = uhidMap[v.uhid] || v.uhid;

            // Insert Visit (and capture new ID)
            const result = await mainDb.run(`INSERT INTO visits (
                uhid, date, visitCount, complaint, history, findings, investigation, 
                diagnosis, actionPlan, treatment, advice, instruction, 
                bp, temp, spo2, pulse, height, weight, bmi, printSettings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    targetUhid, v.date, v.visitCount, v.complaint, v.history, v.findings, v.investigation,
                    v.diagnosis, v.actionPlan, v.treatment, v.advice, v.instruction,
                    v.bp, v.temp, v.spo2, v.pulse, v.height, v.weight, v.bmi, v.printSettings
                ]);

            visitIdMap[v.id] = result.lastID;
        }

        // --- 3. Migrate Prescriptions ---
        const importedPrescriptions = await importDb.all('SELECT * FROM prescriptions');
        for (const pr of importedPrescriptions) {
            const targetUhid = uhidMap[pr.uhid] || pr.uhid;
            const targetVisitId = visitIdMap[pr.visit_id] || pr.visit_id; // If visit wasn't imported (unlikely), keep old? Or it might fail FK.
            // Note: If visit_id refers to a visit that wasn't imported (e.g. partial import?), we might have issues. 
            // Assuming imported DB interprets referential integrity within itself.

            // Insert
            await mainDb.run(`INSERT INTO prescriptions (
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

            // Check Bill No conflict
            let billNo = b.billNo;
            const existingBill = await mainDb.get('SELECT billNo FROM bills WHERE billNo = ?', [billNo]);
            if (existingBill) {
                billNo = `${billNo}-IMP${Math.floor(Math.random() * 1000)}`;
            }

            await mainDb.run(`INSERT INTO bills (
                billNo, uhid, patientName, date, consultant, total, paymentMode, 
                discountType, discountValue, visitCount, items, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    billNo, targetUhid, b.patientName, b.date, b.consultant, b.total, b.paymentMode,
                    b.discountType, b.discountValue, b.visitCount, b.items, b.createdAt
                ]);
        }

        // --- 5. Migrate Medicines (Master Data) - Optional, but good to have ---
        // Only insert if not exists
        const importedMeds = await importDb.all('SELECT * FROM medicines');
        for (const m of importedMeds) {
            await mainDb.run(`INSERT OR IGNORE INTO medicines (id, name, type, code) VALUES (?, ?, ?, ?)`,
                [m.id, m.name, m.type, m.code]);
        }

        await mainDb.exec('COMMIT');

        // Cleanup
        await importDb.close();
        fs.unlinkSync(importPath);

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

        // Rollback
        const mainDb = await getDB();
        await mainDb.exec('ROLLBACK');

        console.error('Import Failed:', e);
        res.status(500).json({ error: 'Import Failed: ' + e.message });
    }
});

// 2. Export Database
router.get('/export', async (req, res) => {
    try {
        if (fs.existsSync(DB_PATH)) {
            res.download(DB_PATH, 'clinic_backup.sqlite');
        } else {
            res.status(404).json({ error: 'Database file not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Delete Database (Clear Patient Data)
router.post('/delete', async (req, res) => {
    let dbInstance = null;
    try {
        dbInstance = await getDB();

        // 1. Disable Foreign Keys temporarily to avoid constraint issues during bulk delete
        await dbInstance.exec('PRAGMA foreign_keys = OFF');

        // 2. Use Transaction
        await dbInstance.exec('BEGIN TRANSACTION');

        // Capture counts for logging (before deletion)
        const counts = {
            bills: (await dbInstance.get('SELECT COUNT(*) as c FROM bills')).c,
            prescriptions: (await dbInstance.get('SELECT COUNT(*) as c FROM prescriptions')).c,
            visits: (await dbInstance.get('SELECT COUNT(*) as c FROM visits')).c,
            patients: (await dbInstance.get('SELECT COUNT(*) as c FROM patients')).c
        };

        // 3. Delete from all patient-related tables
        await dbInstance.run('DELETE FROM bills');
        await dbInstance.run('DELETE FROM prescriptions');
        await dbInstance.run('DELETE FROM visits');
        await dbInstance.run('DELETE FROM patients');

        await dbInstance.exec('COMMIT');

        // 4. Re-enable Foreign Keys
        await dbInstance.exec('PRAGMA foreign_keys = ON');

        // 5. Optimize storage
        await dbInstance.exec('VACUUM');

        console.log(`[Database Wipe] Deleted: ${counts.patients} patients, ${counts.visits} visits, ${counts.bills} bills, ${counts.prescriptions} prescriptions.`);

        res.json({ 
            message: 'All patient data deleted successfully',
            details: counts
        });
    } catch (e) {
        console.error('Database Delete Failed:', e);
        if (dbInstance) {
            try {
                await dbInstance.exec('ROLLBACK');
                await dbInstance.exec('PRAGMA foreign_keys = ON');
            } catch (rollError) {
                console.error('Rollback failed:', rollError);
            }
        }
        res.status(500).json({ error: 'Delete Failed: ' + e.message });
    }
});


module.exports = router;
