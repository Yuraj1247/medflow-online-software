const { getDB } = require('../database');

async function developerAuth(req, res, next) {
    const token = req.headers['x-developer-token'];

    if (!token) {
        return res.status(401).json({ message: "Developer session required" });
    }

    try {
        const db = await getDB();

        // 1. Fetch session
        const session = await db.get('SELECT * FROM developer_sessions WHERE token = ?', [token]);

        if (!session) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        // 2. Check expiry
        if (new Date() > new Date(session.expires_at)) {
            await db.run('DELETE FROM developer_sessions WHERE token = ?', [token]);
            return res.status(401).json({ message: "Developer session expired" });
        }

        // Session is valid
        next();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

module.exports = { developerAuth };
