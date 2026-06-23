const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getDB } = require('../database');

// Helpers
const decrypt = (text) => Buffer.from(text, 'base64').toString('ascii');

async function getMailTransporter() {
    const db = await getDB();
    const config = await db.get('SELECT * FROM developer_config WHERE id = 1');
    if (!config || !config.gmail_user || !config.gmail_pass_encrypted) {
        throw new Error("Gmail credentials not configured");
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.gmail_user,
            pass: decrypt(config.gmail_pass_encrypted)
        }
    });
}

// 1. Get Developer Config (Publicly reachable)
router.get('/config', async (req, res) => {
    try {
        const db = await getDB();
        const config = await db.get('SELECT developer_email, admin_email FROM developer_config WHERE id = 1');
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.5 Set Admin Email (for database deletion)
router.post('/set-admin-email', async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) return res.status(400).json({ message: "Email is required" });
        const db = await getDB();
        await db.run('UPDATE developer_config SET admin_email = ? WHERE id = 1', [email]);
        res.json({ message: "Admin email for deletion set successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Request OTP
router.post('/request-otp', async (req, res) => {
    const { email } = req.body;
    try {
        const db = await getDB();
        const config = await db.get('SELECT * FROM developer_config WHERE id = 1');

        if (email !== config.developer_email) {
            return res.status(403).json({ message: "Invalid developer email" });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 minutes

        // Invalidate previous OTPs
        await db.run('UPDATE developer_otp SET is_used = 1 WHERE is_used = 0');

        // Store OTP
        await db.run(`
            INSERT INTO developer_otp (otp_hash, expires_at)
            VALUES (?, ?)
        `, [otpHash, expiresAt]);

        // Send Email
        const transporter = await getMailTransporter();
        await transporter.sendMail({
            from: `"MedFlow Developer Security" <${config.gmail_user}>`,
            to: config.developer_email,
            subject: "Developer Access OTP",
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
                    <h2 style="color: #2563eb;">Developer Access Request</h2>
                    <p>Your 6-digit OTP for developer access is:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; background: #f1f5f9; padding: 10px; text-align: center; border-radius: 5px; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p style="color: #64748b; font-size: 14px;">This OTP is valid for <b>3 minutes</b> only and can be used for up to 3 attempts.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #94a3b8;">If you did not request this, please ignore this email.</p>
                </div>
            `
        });

        res.json({ message: "OTP sent to your registered email" });
    } catch (e) {
        console.error("OTP Error:", e);
        res.status(500).json({ error: "Failed to send OTP. Check internet connection or Gmail credentials." });
    }
});

// 2.5 Request Deletion OTP (Sent to Admin Email set by Developer)
router.post('/request-delete-otp', async (req, res) => {
    try {
        const db = await getDB();
        const config = await db.get('SELECT * FROM developer_config WHERE id = 1');

        if (!config.admin_email) {
            return res.status(400).json({ message: "Admin email for deletion has not been set by the developer." });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

        // Invalidate previous OTPs
        await db.run('UPDATE developer_otp SET is_used = 1 WHERE is_used = 0');

        // Store OTP
        await db.run(`
            INSERT INTO developer_otp (otp_hash, expires_at)
            VALUES (?, ?)
        `, [otpHash, expiresAt]);

        // Send Email
        const transporter = await getMailTransporter();
        await transporter.sendMail({
            from: `"MedFlow System Security" <${config.gmail_user}>`,
            to: config.admin_email,
            subject: "Database Deletion Authorization",
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ef4444; border-radius: 10px; max-width: 500px; background: #fef2f2;">
                    <h2 style="color: #b91c1c;">CRITICAL: Database Deletion Requested</h2>
                    <p>A request has been made to PERMANENTLY DELETE the MedFlow database. Use the following OTP to authorize this action:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; background: #fff; padding: 10px; text-align: center; border: 2px solid #ef4444; border-radius: 5px; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p style="color: #b91c1c; font-weight: bold;">WARNING: This action cannot be undone.</p>
                    <p style="color: #64748b; font-size: 14px;">This OTP is valid for <b>5 minutes</b> only.</p>
                    <hr style="border: 0; border-top: 1px solid #fca5a5; margin: 20px 0;">
                    <p style="font-size: 12px; color: #94a3b8;">If you did not request this, please contact system support immediately.</p>
                </div>
            `
        });

        res.json({ message: "Deletion OTP sent to the configured Admin email." });
    } catch (e) {
        console.error("Deletion OTP Error:", e);
        res.status(500).json({ error: "Failed to send OTP. Check internet connection or Gmail credentials." });
    }
});

// 3. Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { otp } = req.body;
    try {
        const db = await getDB();
        const latestOtp = await db.get('SELECT * FROM developer_otp WHERE is_used = 0 ORDER BY created_at DESC LIMIT 1');

        if (!latestOtp) {
            return res.status(400).json({ message: "No active OTP found. Please request a new one." });
        }

        // Check expiry
        if (new Date() > new Date(latestOtp.expires_at)) {
            await db.run('UPDATE developer_otp SET is_used = 1 WHERE id = ?', [latestOtp.id]);
            return res.status(400).json({ message: "OTP expired" });
        }

        // Check daily attempts (limit to 3 per day)
        const dailyStats = await db.get(`
            SELECT SUM(attempts) as totalToday 
            FROM developer_otp 
            WHERE date(created_at) = date('now')
        `);
        
        if (dailyStats.totalToday >= 3) {
            return res.status(403).json({ 
                message: "Daily limit of 3 security attempts reached. Please try again tomorrow or contact the developer." 
            });
        }

        // Check attempts for this specific OTP
        if (latestOtp.attempts >= 3) {
            return res.status(403).json({ message: "Too many attempts for this OTP. Please request a new one." });
        }

        const isMatch = await bcrypt.compare(otp, latestOtp.otp_hash);

        if (!isMatch) {
            const newAttempts = latestOtp.attempts + 1;
            await db.run('UPDATE developer_otp SET attempts = ? WHERE id = ?', [newAttempts, latestOtp.id]);

            if (newAttempts >= 3) {
                await db.run('UPDATE developer_otp SET is_used = 1 WHERE id = ?', [latestOtp.id]);
                return res.status(403).json({ message: "Incorrect OTP. Maximum attempts reached." });
            }

            return res.status(401).json({ message: `Incorrect OTP. ${3 - newAttempts} attempts remaining.` });
        }

        // Success
        await db.run('UPDATE developer_otp SET is_used = 1 WHERE id = ?', [latestOtp.id]);

        // Create Developer Session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

        await db.run('INSERT INTO developer_sessions (token, expires_at) VALUES (?, ?)', [sessionToken, sessionExpiry]);

        res.json({
            success: true,
            sessionToken,
            message: "Developer Access Granted",
            expiresIn: 30
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Reset Admin Password
router.post('/reset-admin-password', async (req, res) => {
    const { newPassword } = req.body;
    try {
        if (!newPassword) {
            return res.status(400).json({ message: "New password is required" });
        }

        const db = await getDB();
        const passwordHash = await bcrypt.hash(newPassword, 10);
        
        await db.run('UPDATE users SET password_hash = ? WHERE role = ?', [passwordHash, 'ADMIN']);
        res.json({ message: "Admin password reset successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
