const { getDB } = require('../database');

async function verifySubscription() {
    const db = await getDB();
    const sub = await db.get('SELECT * FROM subscription WHERE id = 1');

    if (!sub) return { status: 'ACTIVE' }; // Should be seeded

    const todayDate = new Date();
    const today = todayDate.toISOString().split('T')[0];

    if (sub.is_lifetime === 1) {
        if (sub.status !== 'ACTIVE') {
            await db.run('UPDATE subscription SET status = ?, last_checked_date = ? WHERE id = 1', ['ACTIVE', today]);
        }
        return { status: 'ACTIVE' };
    }

    let status = sub.status;
    let reason = null;

    if (today < sub.last_checked_date) {
        status = 'BLOCKED';
        reason = 'SYSTEM_DATE_TAMPERED';
    } else if (today > sub.end_date) {
        status = 'EXPIRED';
        reason = 'SUBSCRIPTION_EXPIRED';
    } else {
        status = 'ACTIVE';
    }

    if (today > sub.last_checked_date || status !== sub.status) {
        await db.run('UPDATE subscription SET status = ?, last_checked_date = ? WHERE id = 1', [status, today]);
    }

    return { status, reason };
}

async function checkSubscription(req, res, next) {
    console.log(`Checking Subscription for: ${req.method} ${req.originalUrl}`);
    try {
        const { status, reason } = await verifySubscription();

        if (status !== 'ACTIVE') {
            // WHITELIST: Allow essential routes for the login page and admin panel recovery
            // We allow GET /api/users and GET /api/master so the login page can load and the admin can log in.
            const isEssentialGet = req.method === 'GET' && (req.path === '/' || req.path === '/roles');
            const isMasterGet = req.method === 'GET' && req.baseUrl === '/api/master';
            const isUsersGet = req.method === 'GET' && req.baseUrl === '/api/users';

            // Also allow the update subscription endpoint if it's hit (though it's usually in subscriptionRoutes which is already exempt)

            if (isEssentialGet || isMasterGet || isUsersGet) {
                return next();
            }

            return res.status(403).json({
                error: 'ACCESS_DENIED',
                status: status,
                code: reason
            });
        }

        next();
    } catch (error) {
        console.error('Subscription Check Error:', error);
        res.status(500).json({ error: 'Internal Server Error during subscription check' });
    }
}

module.exports = { checkSubscription, verifySubscription };
