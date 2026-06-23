const bcrypt = require('bcryptjs');
const { getDB } = require('./database');

async function verifyAdmin() {
    const db = await getDB();
    const user = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!user) {
        console.log('Admin user not found');
        return;
    }
    console.log('User found:', user.username);
    const pin = 'admin123';
    const isMatch = await bcrypt.compare(pin, user.password_hash);
    console.log(`Bcrypt compare for PIN "${pin}": ${isMatch}`);
}

verifyAdmin();
