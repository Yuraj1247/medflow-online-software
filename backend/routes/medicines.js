const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// Get All
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const meds = await db.all('SELECT * FROM medicines ORDER BY name');
        res.json(meds);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save (Upsert)
router.post('/', async (req, res) => {
    const m = req.body;
    try {
        const db = await getDB();
        await db.run('INSERT INTO medicines (id, name, type, code) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, code=excluded.code',
            [m.id, m.name, m.type, m.code]);
        res.json({ message: 'Medicine saved' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        const db = await getDB();
        await db.run('DELETE FROM medicines WHERE id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
