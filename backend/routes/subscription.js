const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const bcrypt = require('bcryptjs');

const { developerAuth } = require('../middleware/developerAuth');

// GET /api/subscription/status
router.get('/status', async (req, res) => {
    try {
        const db = await getDB();
        const sub = await db.get('SELECT is_lifetime, start_date, end_date, last_checked_date, status FROM subscription WHERE id = 1');
        res.json(sub);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/subscription/update
// Securely update subscription via Developer Access
router.post('/update', developerAuth, async (req, res) => {
    const { is_lifetime, start_date, end_date } = req.body;

    try {
        const db = await getDB();

        // 2. Update Subscription
        const today = new Date().toISOString().split('T')[0];

        await db.run(`
            UPDATE subscription 
            SET is_lifetime = ?, 
                start_date = ?, 
                end_date = ?, 
                last_checked_date = ?, 
                status = 'ACTIVE',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [is_lifetime ? 1 : 0, start_date, end_date, today]);

        res.json({ message: 'Subscription updated successfully', status: 'ACTIVE' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
