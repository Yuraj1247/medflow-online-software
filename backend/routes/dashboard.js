const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

router.get('/stats', async (req, res) => {
    try {
        const db = await getDB();
        const today = new Date().toISOString().split('T')[0];

        // Total Patients
        const totalPatients = await db.get('SELECT count(*) as count FROM patients');

        // Today's Visits (Distinct Patients verified today)
        // Visits table has date column
        const todayVisits = await db.get('SELECT count(*) as count FROM visits WHERE date = ?', [today]);

        // Today's Revenue
        const todayRevenue = await db.get('SELECT sum(total) as total FROM bills WHERE date = ?', [today]);

        res.json({
            totalPatients: totalPatients.count,
            todayVisits: todayVisits.count,
            todayRevenue: todayRevenue.total || 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
