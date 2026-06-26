const express = require('express');
const router = express.Router();
const { getDB, logAudit } = require('../database');

// Get ALL visits (with patient data joined) — for Search Page
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const rows = await db.all(`
            SELECT v.id as visitId, v.uhid, v.date as visitDate, v.visitCount, v.nextVisitDate,
                   p.title, p.firstName, p.middleName, p.lastName, p.age, p.sex,
                   p.mobile, p.address, p.state, p.city, p.taluka,
                   p.userType, p.consultantName, p.referredBy, p.paymentBy,
                   p.date as registrationDate, p.email, p.idProofType, p.idProofNumber,
                   p.purposeOfVisit, p.birthDate, p.visitCount as totalVisits,
                   (SELECT COUNT(*) FROM prescriptions pr WHERE pr.visit_id = v.id) as prescriptionCount
            FROM visits v
            INNER JOIN patients p ON v.uhid = p.uhid
            ORDER BY v.date DESC, v.id DESC
        `);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get History for Patient
router.get('/:uhid', async (req, res) => {
    try {
        const db = await getDB();
        const visits = await db.all('SELECT * FROM visits WHERE uhid = ? ORDER BY visitCount ASC', [req.params.uhid]);

        // Hydrate visits with prescriptions
        const history = [];
        for (const v of visits) {
            const meds = await db.all('SELECT * FROM prescriptions WHERE visit_id = ?', [v.id]);

            // Reconstruct ClinicalData object
            const clinicalData = {
                complaint: v.complaint,
                history: v.history,
                findings: v.findings,
                investigation: v.investigation,
                diagnosis: v.diagnosis,
                actionPlan: v.actionPlan,
                treatment: v.treatment,
                advice: v.advice,
                instruction: v.instruction,
                vitals: {
                    bp: v.bp,
                    temp: v.temp,
                    spo2: v.spo2,
                    pulse: v.pulse,
                    height: v.height,
                    weight: v.weight,
                    bmi: v.bmi
                },
                prescriptions: meds.map(m => ({
                    medicineName: m.medicineName,
                    type: m.type,
                    dosage: m.dosage,
                    instruction: m.instruction,
                    days: m.days
                })),
                nextVisitDate: v.nextVisitDate || '', // Now reading from schema
                printSettings: v.printSettings ? JSON.parse(v.printSettings) : {}
            };

            history.push({
                id: v.id.toString(), // DB ID
                date: v.date,
                visitCount: v.visitCount,
                data: clinicalData
            });
        }

        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create New Visit
router.post('/', async (req, res) => {
    const { uhid, date, visitCount, data } = req.body;
    // data is ClinicalData interface

    if (!uhid || !data) {
        return res.status(400).json({ message: 'Missing Data' });
    }

    try {
        const db = await getDB();

        // Check if visit already exists for this uhid and visitCount
        const existingVisit = await db.get('SELECT id FROM visits WHERE uhid = ? AND visitCount = ?', [uhid, visitCount]);

        // Enforce: Only 1 visit per patient per day (for NEW visits only, not updates)
        if (!existingVisit) {
            const sameDayVisit = await db.get(
                'SELECT id FROM visits WHERE uhid = ? AND date = ?',
                [uhid, date]
            );
            if (sameDayVisit) {
                return res.status(409).json({
                    message: 'Only 1 visit per patient is allowed on the same day. A visit already exists for this patient on this date.'
                });
            }
        }

        let visitId;
        if (existingVisit) {
            visitId = existingVisit.id;
            // Update Existing Visit
            await db.run(`UPDATE visits SET 
                date = ?, complaint = ?, history = ?, findings = ?, investigation = ?, 
                diagnosis = ?, actionPlan = ?, treatment = ?, advice = ?, instruction = ?, 
                bp = ?, temp = ?, spo2 = ?, pulse = ?, height = ?, weight = ?, bmi = ?, 
                printSettings = ?, nextVisitDate = ?
                WHERE id = ?`,
                [
                    date, data.complaint, data.history, data.findings, data.investigation,
                    data.diagnosis, data.actionPlan, data.treatment, data.advice, data.instruction,
                    data.vitals?.bp, data.vitals?.temp, data.vitals?.spo2, data.vitals?.pulse, data.vitals?.height, data.vitals?.weight, data.vitals?.bmi,
                    JSON.stringify(data.printSettings || {}),
                    data.nextVisitDate || '',
                    visitId
                ]);

            // Clear existing prescriptions to refresh them
            await db.run('DELETE FROM prescriptions WHERE visit_id = ?', [visitId]);
        } else {
            // Insert New Visit
            const result = await db.run(`INSERT INTO visits (
                uhid, date, visitCount, 
                complaint, history, findings, investigation, diagnosis, actionPlan, 
                treatment, advice, instruction, 
                bp, temp, spo2, pulse, height, weight, bmi, 
                printSettings, nextVisitDate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uhid, date, visitCount,
                    data.complaint, data.history, data.findings, data.investigation, data.diagnosis, data.actionPlan,
                    data.treatment, data.advice, data.instruction,
                    data.vitals?.bp, data.vitals?.temp, data.vitals?.spo2, data.vitals?.pulse, data.vitals?.height, data.vitals?.weight, data.vitals?.bmi,
                    JSON.stringify(data.printSettings || {}),
                    data.nextVisitDate || ''
                ]);
            visitId = result.lastID;
        }

        // Insert Prescriptions (New or Updated)
        if (data.prescriptions && data.prescriptions.length > 0) {
            for (const rx of data.prescriptions) {
                await db.run(`INSERT INTO prescriptions (
                    visit_id, uhid, medicineName, type, dosage, instruction, days, date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        visitId, uhid, rx.medicineName, rx.type, rx.dosage, rx.instruction, rx.days, date
                    ]);
            }
        }

        // Update the patient's master visitCount to match the latest visit history
        const maxVisitResult = await db.get('SELECT MAX(visitCount) as maxV FROM visits WHERE uhid = ?', [uhid]);
        if (maxVisitResult && maxVisitResult.maxV !== null) {
            await db.run('UPDATE patients SET visitCount = ? WHERE uhid = ?', [maxVisitResult.maxV, uhid]);
        }

        await logAudit(req, 'PRESCRIPTION_SAVED', 'PRESCRIPTION', `Prescriptions/Vitals updated/created for patient: ${uhid} (Visit Count: ${visitCount})`);

        res.json({ message: existingVisit ? 'Visit Updated' : 'Visit Saved', id: visitId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Delete a Specific Visit by UHID + Visit Number
router.delete('/:uhid/:visitCount', async (req, res) => {
    const { uhid, visitCount } = req.params;
    try {
        const db = await getDB();

        // Find the visit
        const visit = await db.get('SELECT id FROM visits WHERE uhid = ? AND visitCount = ?', [uhid, parseInt(visitCount)]);
        if (!visit) {
            return res.status(404).json({ message: 'Visit not found' });
        }

        // Delete prescriptions for this visit
        await db.run('DELETE FROM prescriptions WHERE visit_id = ?', [visit.id]);

        // Delete the visit
        await db.run('DELETE FROM visits WHERE id = ?', [visit.id]);

        // Also delete the bill for this visit if it exists
        await db.run('DELETE FROM bills WHERE uhid = ? AND visitCount = ?', [uhid, parseInt(visitCount)]);

        // RE-SEQUENCE: Shift all subsequent visits down by 1
        await db.run('UPDATE visits SET visitCount = visitCount - 1 WHERE uhid = ? AND visitCount > ?', [uhid, parseInt(visitCount)]);

        // Also shift subsequent bills down by 1 to maintain link
        await db.run('UPDATE bills SET visitCount = visitCount - 1 WHERE uhid = ? AND visitCount > ?', [uhid, parseInt(visitCount)]);

        // Update patient record
        const remainingVisitsCount = await db.get('SELECT COUNT(*) as count FROM visits WHERE uhid = ?', [uhid]);
        if (!remainingVisitsCount || remainingVisitsCount.count == 0) {
            // No visits left? Delete the patient record entirely
            await db.run('DELETE FROM patients WHERE uhid = ?', [uhid]);
            console.log(`Purged patient ${uhid} because all visits were deleted.`);
        } else {
            // Update the master visitCount to the new total
            const maxVisit = await db.get('SELECT MAX(visitCount) as maxV FROM visits WHERE uhid = ?', [uhid]);
            await db.run('UPDATE patients SET visitCount = ? WHERE uhid = ?', [maxVisit.maxV || 0, uhid]);
        }

        res.json({ message: 'Visit deleted and subsequent visits re-sequenced' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
