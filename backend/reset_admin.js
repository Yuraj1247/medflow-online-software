const bcrypt = require('bcryptjs');
const { getDB } = require('./database');

async function resetAdmin() {
    const db = await getDB();
    const pin = 'admin123';
    const hash = await bcrypt.hash(pin, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin']);
    console.log('Admin password reset to admin123');
}

resetAdmin();
