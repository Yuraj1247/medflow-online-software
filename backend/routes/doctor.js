const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET Page Settings for a Doctor
router.get('/page-settings/:doctorId', async (req, res) => {
    try {
        const db = await getDB();
        let settings = await db.get('SELECT * FROM doctor_page_settings WHERE doctor_id = ?', [req.params.doctorId]);

        if (!settings) {
            // Return default settings if none exist
            settings = {
                doctor_id: req.params.doctorId,
                paper_size: 'A4',
                header_enabled: 1,
                margin_top_cm: 2.0,
                margin_left_cm: 2.0,
                margin_right_cm: 2.0,
                margin_bottom_cm: 2.0
            };
        }
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST (Save) Page Settings for a Doctor
router.post('/page-settings', async (req, res) => {
    const {
        doctor_id,
        paper_size,
        header_enabled,
        margin_top_cm,
        margin_left_cm,
        margin_right_cm,
        margin_bottom_cm
    } = req.body;

    if (!doctor_id) {
        return res.status(400).json({ message: 'Doctor ID is required' });
    }

    try {
        const db = await getDB();

        await db.run(`
            INSERT INTO doctor_page_settings (
                doctor_id, paper_size, header_enabled, 
                margin_top_cm, margin_left_cm, margin_right_cm, margin_bottom_cm,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(doctor_id) DO UPDATE SET
                paper_size = excluded.paper_size,
                header_enabled = excluded.header_enabled,
                margin_top_cm = excluded.margin_top_cm,
                margin_left_cm = excluded.margin_left_cm,
                margin_right_cm = excluded.margin_right_cm,
                margin_bottom_cm = excluded.margin_bottom_cm,
                updated_at = CURRENT_TIMESTAMP
        `, [
            doctor_id, paper_size || 'A4', header_enabled ?? 1,
            margin_top_cm ?? 2.0, margin_left_cm ?? 2.0,
            margin_right_cm ?? 2.0, margin_bottom_cm ?? 2.0
        ]);

        res.json({ message: 'Settings saved successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
