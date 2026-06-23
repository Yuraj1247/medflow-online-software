const bcrypt = require('bcryptjs');
const { getDB } = require('./database');

async function resetAll() {
    const db = await getDB();

    const adminHash = await bcrypt.hash('admin123', 10);
    await db.run('UPDATE users SET password_hash = ? WHERE role = ?', [adminHash, 'ADMIN']);

    const docHash = await bcrypt.hash('1234', 10);
    await db.run('UPDATE users SET password_hash = ? WHERE role = ?', [docHash, 'DOCTOR']);

    console.log('Reset admin to admin123 and doctors to 1234');
}

resetAll();
