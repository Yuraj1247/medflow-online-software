const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDB, getJwtSecret, logAudit } = require('../database');
const { authenticateToken } = require('../middleware/authMiddleware');

// Login
router.post('/login', async (req, res) => {
    const { username, password, userId, pin } = req.body;
    const finalUsername = username || userId;
    const finalPassword = password || pin;

    try {
        const db = await getDB();
        // Support both username and id for compatibility
        const user = await db.get('SELECT * FROM users WHERE username = ? OR id = ?', [finalUsername, finalUsername]);


        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.is_active) {
            return res.status(403).json({ message: 'User account is inactive' });
        }

        const isMatch = await bcrypt.compare(finalPassword, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid Credentials' });
        }

        // Get Secret from DB
        const jwtSecret = await getJwtSecret();

        // Create Token
        const token = jwt.sign(
            { id: user.id, role: user.role ? user.role.toUpperCase() : '', name: user.name, username: user.username },
            jwtSecret,
            { expiresIn: '12h' }
        );

        // Audit Log Login
        await logAudit(req, 'LOGIN', 'AUTH', `User logged in: ${user.username} (${user.role})`, user.id, user.username, user.role);

        // Remove password hash and potential legacy pin from response
        const { password_hash, pin, ...userSafe } = user;
        if (userSafe.role) {
            userSafe.role = userSafe.role.toUpperCase();
        }

        res.json({ token, user: userSafe });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await logAudit(req, 'LOGOUT', 'AUTH', `User logged out: ${req.user.username}`);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verify Developer Access Code
router.post('/verify-developer', async (req, res) => {
    const { code } = req.body;
    try {
        const db = await getDB();
        const devSec = await db.get('SELECT value_hash FROM developer_security WHERE key = ?', ['dev_access_code']);

        if (!devSec) {
            return res.status(500).json({ message: 'Security system not initialized' });
        }

        const isMatch = await bcrypt.compare(code, devSec.value_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid Developer Code' });
        }

        res.json({ success: true, message: 'Developer Access Granted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Developer Access Code (Optional but recommended in requirements)
router.post('/update-developer-code', async (req, res) => {
    const { currentCode, newCode } = req.body;
    try {
        const db = await getDB();
        const devSec = await db.get('SELECT value_hash FROM developer_security WHERE key = ?', ['dev_access_code']);

        const isMatch = await bcrypt.compare(currentCode, devSec.value_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Current code is incorrect' });
        }

        const newHash = await bcrypt.hash(newCode, 12);
        await db.run('UPDATE developer_security SET value_hash = ? WHERE key = ?', [newHash, 'dev_access_code']);

        res.json({ message: 'Developer Security Code Updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

