const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function checkLimit() {
    let storagePath = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 'medflow-hms');
    const DB_PATH = path.join(storagePath, 'database.sqlite');
    
    if (!fs.existsSync(DB_PATH)) {
        console.log("Database not found at " + DB_PATH);
        return;
    }

    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    const limit = await db.get("SELECT value FROM master_data WHERE key = 'totalPatientLimit'");
    const enable = await db.get("SELECT value FROM master_data WHERE key = 'enablePatientLimit'");
    const patients = await db.all("SELECT uhid, visitCount FROM patients");
    const visits = await db.all("SELECT id, uhid FROM visits");

    console.log("Limit Value:", limit ? JSON.parse(limit.value) : "Not Set");
    console.log("Enable Limit:", enable ? JSON.parse(enable.value) : "Not Set");
    console.log("Patient Count:", patients.length);
    console.log("Visit Count:", visits.length);
    
    await db.close();
}

checkLimit().catch(console.error);
