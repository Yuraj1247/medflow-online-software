const path = require('path');
const { getDB } = require(path.join(__dirname, '..', 'backend', 'database'));
async function main() {
    const db = await getDB();
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log(JSON.stringify(tables, null, 2));
    process.exit(0);
}
main();
