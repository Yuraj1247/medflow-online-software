const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// Default Master Data (If Table Empty/Missing Keys)
// NOTE: We could duplicate the constants from frontend here, but simpler to just serve what is in DB
// and let the frontend send defaults if missing on first run?
// Better: Backend should guarantee structure.

// Fetch All Master Data
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const rows = await db.all('SELECT * FROM master_data');

        const data = {};
        rows.forEach(r => {
            try {
                data[r.key] = JSON.parse(r.value);
            } catch (e) {
                data[r.key] = r.value;
            }
        });

        // If empty (first run), we might want to return empty object and let frontend initialize?
        // OR the initial seed in db.js handles it?
        // The db.js seed handled users/medicines. It didn't seed master_data because it's huge.
        // Frontend has "defaults".
        // Strategy: Frontend 'getMasterData' checks API. If empty, it sends 'defaults' to save.

        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Batch or Single
router.post('/', async (req, res) => {
    const data = req.body; // Expect Key-Value object
    try {
        const db = await getDB();
        const stmt = await db.prepare('INSERT INTO master_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

        for (const [key, value] of Object.entries(data)) {
            await stmt.run(key, JSON.stringify(value));
        }
        await stmt.finalize();

        res.json({ message: 'Master Data Updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// User Preferences (Isolated)
// Table: master_data or new table? 
// Current storage key: 'medflow_prefs_userid'.
// We can store it in master_data with that key, or better, `user_prefs` table?
// Sticking to master_data for simplicity as it is key-value.
router.get('/prefs/:userId', async (req, res) => {
    try {
        const db = await getDB();
        const key = `prefs_${req.params.userId}`;
        const row = await db.get('SELECT value FROM master_data WHERE key = ?', [key]);
        if (row) {
            res.json(JSON.parse(row.value));
        } else {
            res.json({});
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/prefs/:userId', async (req, res) => {
    try {
        const db = await getDB();
        const key = `prefs_${req.params.userId}`;
        const value = JSON.stringify(req.body);
        await db.run('INSERT INTO master_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
        res.json({ message: 'Preferences Saved' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
