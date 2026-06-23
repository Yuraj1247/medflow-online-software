const { initDB, getDB, getJwtSecret } = require('./database');

async function run() {
    try {
        console.log("--- Initializing DB ---");
        await initDB();
        const db = await getDB();

        console.log("\n--- Checking Users Table Schema ---");
        const info = await db.all("PRAGMA table_info(users)");
        console.log(JSON.stringify(info, null, 2));

        console.log("\n--- Checking App Config (JWT Secret) ---");
        try {
            const secret = await getJwtSecret();
            console.log("JWT Secret retrieved successfully:", secret ? "YES (hidden)" : "NO");
        } catch (e) {
            console.error("Failed to get JWT Secret:", e.message);
        }

        console.log("\n--- Fetching Users ---");
        try {
            const users = await db.all('SELECT id, username, name, role, designation, is_active, created_at, "****" as pin FROM users');
            console.log("Users found:", users.length);
            console.log(JSON.stringify(users, null, 2));
        } catch (e) {
            console.error("Failed to fetch users:", e);
        }

    } catch (e) {
        console.error("CRITICAL ERROR:", e);
    }
}

run();
