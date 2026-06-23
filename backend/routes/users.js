const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../database');

const SALT_ROUNDS = 10;

router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        // Return '****' for pin to satisfy frontend but keep it secure
        const users = await db.all('SELECT id, username, name, UPPER(role) as role, designation, is_active, created_at, "****" as pin FROM users');
        res.json(users);
    } catch (e) {
        console.error("DEBUG [GET /users]:", e);
        res.status(500).json({ error: e.message });
    }
});


router.post('/', async (req, res) => {
    const u = req.body;
    try {
        const db = await getDB();
        const exists = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [u.id]);

        let passwordHash = u.password_hash;
        const plainPassword = u.password || u.pin;

        // Don't re-hash the masked pin
        if (plainPassword && plainPassword !== '****') {
            passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
        }

        const finalRole = u.role ? u.role.toUpperCase() : 'DOCTOR';
        let finalName = u.name || '';
        if (finalRole === 'DOCTOR' && finalName) {
            let cleaned = finalName.trim();
            if (!cleaned.toLowerCase().startsWith('dr.') && !cleaned.toLowerCase().startsWith('dr ')) {
                finalName = `Dr. ${cleaned}`;
            } else if (cleaned.toLowerCase().startsWith('dr ')) {
                // Change "Dr Name" to "Dr. Name" for consistency
                finalName = `Dr. ${cleaned.substring(3).trim()}`;
            }
        }

        if (exists) {
            // Update existing user
            if (passwordHash && plainPassword !== '****') {
                await db.run('UPDATE users SET username=?, name=?, role=?, designation=?, password_hash=?, is_active=? WHERE id=?',
                    [u.username || u.id, finalName, finalRole, u.designation, passwordHash, u.is_active !== undefined ? u.is_active : 1, u.id]);
            } else {
                await db.run('UPDATE users SET username=?, name=?, role=?, designation=?, is_active=? WHERE id=?',
                    [u.username || u.id, finalName, finalRole, u.designation, u.is_active !== undefined ? u.is_active : 1, u.id]);
            }
        } else {
            // Create new user
            if (!passwordHash) {
                return res.status(400).json({ message: 'Password is required for new users' });
            }
            await db.run('INSERT INTO users (id, username, name, role, designation, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [u.id, u.username || u.id, finalName, finalRole, u.designation, passwordHash, u.is_active !== undefined ? u.is_active : 1]);
        }
        res.json({ message: 'User Saved Successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



router.delete('/:id', async (req, res) => {
    try {
        const db = await getDB();

        // Prevent deleting last admin
        const u = await db.get('SELECT role FROM users WHERE id = ?', [req.params.id]);
        if (u && u.role === 'ADMIN') {
            const admins = await db.get('SELECT count(*) as count FROM users WHERE role = "ADMIN"');
            if (admins.count <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last Administrator.' });
            }
        }

        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/rename-consultant', async (req, res) => {
    const { oldName, newName } = req.body;
    try {
        const db = await getDB();

        // 1. Update Master Data (Consultants List)
        const row = await db.get('SELECT value FROM master_data WHERE key = ?', ['consultants']);
        if (row) {
            let list = JSON.parse(row.value);
            const idx = list.indexOf(oldName);
            // If exists, replace. If not, maybe append? Better just replace if found.
            if (idx !== -1) {
                list[idx] = newName;
                await db.run('UPDATE master_data SET value = ? WHERE key = ?', [JSON.stringify(list), 'consultants']);
            }
        }

        // 2. Update Patients
        await db.run('UPDATE patients SET consultantName = ? WHERE consultantName = ?', [newName, oldName]);

        // 3. Update Bills
        await db.run('UPDATE bills SET consultant = ? WHERE consultant = ?', [newName, oldName]);

        res.json({ message: 'Renamed successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Roles
router.get('/roles', async (req, res) => {
    try {
        const db = await getDB();
        const roles = await db.all('SELECT * FROM roles');
        res.json(roles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
