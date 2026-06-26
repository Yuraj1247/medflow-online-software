const express = require('express');
const router = express.Router();
const { getDB, logAudit } = require('../database');

// Get All (or Search)
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const { search } = req.query;
        let query = 'SELECT * FROM patients WHERE visitCount > 0 ORDER BY date DESC, createdAt DESC';
        let params = [];

        if (search) {
            query = `SELECT * FROM patients WHERE 
                (firstName LIKE ? OR 
                 lastName LIKE ? OR 
                 mobile LIKE ? OR 
                 uhid LIKE ?) 
                AND visitCount > 0
                ORDER BY date DESC`;
            const term = `%${search}%`;
            params = [term, term, term, term];
        }

        const patients = await db.all(query, params);
        res.json(patients);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get One
router.get('/:uhid', async (req, res) => {
    try {
        const db = await getDB();
        const patient = await db.get('SELECT * FROM patients WHERE uhid = ?', [req.params.uhid]);
        if (patient) res.json(patient);
        else res.status(404).json({ message: 'Patient not found' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create / Update (Upsert)
router.post('/', async (req, res) => {
    const p = req.body;
    try {
        const db = await getDB();

        // Check if exists
        const exists = await db.get('SELECT uhid FROM patients WHERE uhid = ?', [p.uhid]);

        if (exists) {
            // Update
            await db.run(`UPDATE patients SET 
                title=?, firstName=?, middleName=?, lastName=?, birthDate=?, age=?, sex=?, 
                address=?, state=?, city=?, taluka=?, mobile=?, email=?, 
                referredBy=?, paymentBy=?, consultantName=?, idProofType=?, idProofNumber=?, 
                purposeOfVisit=?, userType=?, date=?, visitCount=?
                WHERE uhid=?`,
                [
                    p.title, p.firstName, p.middleName, p.lastName, p.birthDate, p.age, p.sex,
                    p.address, p.state, p.city, p.taluka, p.mobile, p.email,
                    p.referredBy, p.paymentBy, p.consultantName, p.idProofType, p.idProofNumber,
                    p.purposeOfVisit, p.userType, p.date, p.visitCount || 0,
                    p.uhid
                ]
            );
            await logAudit(req, 'PATIENT_UPDATED', 'PATIENTS', `Patient updated: ${p.firstName} ${p.lastName} (${p.uhid})`);
        } else {
            // Insert
            await db.run(`INSERT INTO patients (
                uhid, date, userType, title, firstName, middleName, lastName, 
                birthDate, age, sex, address, state, city, taluka, mobile, email,
                referredBy, paymentBy, consultantName, idProofType, idProofNumber, purposeOfVisit,
                visitCount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    p.uhid, p.date, p.userType, p.title, p.firstName, p.middleName, p.lastName,
                    p.birthDate, p.age, p.sex, p.address, p.state, p.city, p.taluka, p.mobile, p.email,
                    p.referredBy, p.paymentBy, p.consultantName, p.idProofType, p.idProofNumber, p.purposeOfVisit,
                    p.visitCount || 0
                ]);
            await logAudit(req, 'PATIENT_ADDED', 'PATIENTS', `Patient registered: ${p.firstName} ${p.lastName} (${p.uhid})`);
        }
        res.json({ message: 'Saved successfully', uhid: p.uhid });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Delete
router.delete('/:uhid', async (req, res) => {
    try {
        const db = await getDB();
        await db.run('DELETE FROM patients WHERE uhid = ?', [req.params.uhid]);
        await logAudit(req, 'PATIENT_DELETED', 'PATIENTS', `Patient deleted: ${req.params.uhid}`);
        res.json({ message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
