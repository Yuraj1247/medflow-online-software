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

        // Query clinic profile and populate virtual properties for compatibility
        const profile = await db.get('SELECT * FROM clinic_profile WHERE id = 1');
        if (profile) {
            data.clinicName = profile.hospital_name || profile.clinic_name || 'Clinic';
            data.clinicAddress = `${profile.address}, ${profile.city}, ${profile.state} - ${profile.pincode}`;
            data.clinicContact = `${profile.phone} | ${profile.email}${profile.website ? ' | ' + profile.website : ''}`;
            data.clinicProfile = profile;
        }

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

        for (const [key, value] of Object.entries(data)) {
            if (key === 'clinicProfile' && value) {
                const cp = value;
                await db.run(`
                    INSERT INTO clinic_profile (
                        id, clinic_name, hospital_name, logo, address, city, state, pincode, phone, email, website, gst_number, registration_number, letterhead_enabled, footer_text
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        clinic_name = excluded.clinic_name,
                        hospital_name = excluded.hospital_name,
                        logo = excluded.logo,
                        address = excluded.address,
                        city = excluded.city,
                        state = excluded.state,
                        pincode = excluded.pincode,
                        phone = excluded.phone,
                        email = excluded.email,
                        website = excluded.website,
                        gst_number = excluded.gst_number,
                        registration_number = excluded.registration_number,
                        letterhead_enabled = excluded.letterhead_enabled,
                        footer_text = excluded.footer_text,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    cp.clinic_name || '', cp.hospital_name || '', cp.logo || '', cp.address || '', cp.city || '', cp.state || '', cp.pincode || '',
                    cp.phone || '', cp.email || '', cp.website || '', cp.gst_number || '', cp.registration_number || '', cp.letterhead_enabled !== undefined ? cp.letterhead_enabled : 1, cp.footer_text || ''
                ]);
            } else {
                await db.run('INSERT INTO master_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
            }
        }

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
