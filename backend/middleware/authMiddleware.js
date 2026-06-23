const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../database');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token && req.query.token) {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const secret = await getJwtSecret();
        jwt.verify(token, secret, (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Invalid or expired token' });
            }
            req.user = user;
            next();
        });
    } catch (e) {
        console.error("Auth Middleware Error:", e);
        return res.status(500).json({ message: 'Internal Server Error during Authentication' });
    }
}

module.exports = { authenticateToken };
