const { getDB } = require('./database');
async function run() {
    const db = await getDB();
    const info = await db.all("PRAGMA table_info(users)");
    console.log(JSON.stringify(info, null, 2));
}
run();
