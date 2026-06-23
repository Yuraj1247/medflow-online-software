const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// Get All (Recent 100 or Search)
router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const bills = await db.all('SELECT * FROM bills ORDER BY date DESC, createdAt DESC LIMIT 200');
        // Parse items JSON
        const parsed = bills.map(b => ({
            ...b,
            items: JSON.parse(b.items)
        }));
        res.json(parsed);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save (Upsert)
router.post('/', async (req, res) => {
    const b = req.body;
    try {
        const db = await getDB();

        // 1. Check if bill exists by billNo
        const existsByNo = await db.get('SELECT billNo FROM bills WHERE billNo = ?', [b.billNo]);

        // 2. Check if a bill already exists for this uhid and visitCount
        const existsByVisit = await db.get('SELECT billNo FROM bills WHERE uhid = ? AND visitCount = ?', [b.uhid, b.visitCount]);

        const targetBillNo = existsByNo ? b.billNo : (existsByVisit ? existsByVisit.billNo : b.billNo);
        const shouldUpdate = !!(existsByNo || existsByVisit);

        if (shouldUpdate) {
            await db.run(`UPDATE bills SET 
                uhid=?, patientName=?, date=?, consultant=?, total=?, 
                paymentMode=?, discountType=?, discountValue=?, visitCount=?, items=?
                WHERE billNo=?`,
                [
                    b.uhid, b.patientName, b.date, b.consultant, b.total,
                    b.paymentMode, b.discountType, b.discountValue, b.visitCount, JSON.stringify(b.items),
                    targetBillNo
                ]);
        } else {
            await db.run(`INSERT INTO bills (
                billNo, uhid, patientName, date, consultant, total, 
                paymentMode, discountType, discountValue, visitCount, items
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    b.billNo, b.uhid, b.patientName, b.date, b.consultant, b.total,
                    b.paymentMode, b.discountType, b.discountValue, b.visitCount, JSON.stringify(b.items)
                ]);
        }
        res.json({ message: shouldUpdate ? 'Bill updated' : 'Bill saved' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
