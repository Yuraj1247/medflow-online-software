const { getDB } = require('./database');

async function checkUsers() {
    try {
        const db = await getDB();
        const users = await db.all('SELECT id, username, name, role, password_hash, is_active FROM users');
        console.log('--- USERS IN DATABASE ---');
        console.log(JSON.stringify(users, null, 2));
        console.log('-------------------------');
        const roles = await db.all('SELECT * FROM roles');
        console.log('--- ROLES IN DATABASE ---');
        console.log(JSON.stringify(roles, null, 2));
        console.log('-------------------------');
    } catch (e) {
        console.error(e);
    }
}

checkUsers();
