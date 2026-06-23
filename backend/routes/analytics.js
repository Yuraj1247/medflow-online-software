const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/analytics/today - Returns all analytics data for today
router.get('/today', async (req, res) => {
    try {
        const db = await getDB();
        const today = new Date().toISOString().split('T')[0];

        // ===================== 1. REVENUE STATS =====================

        // Bills for today
        const todayBills = await db.all(
            `SELECT * FROM bills WHERE date = ?`, [today]
        );

        const totalRevenue = todayBills.reduce((sum, b) => sum + (b.total || 0), 0);
        const avgTransaction = todayBills.length > 0 ? totalRevenue / todayBills.length : 0;
        const totalDiscount = todayBills.reduce((sum, b) => {
            if (b.discountType === 'flat') return sum + (b.discountValue || 0);
            if (b.discountType === 'percent') {
                // approximate discount amount from percent
                const subtotal = (b.total || 0) + (b.discountValue || 0);
                return sum + (subtotal * (b.discountValue || 0) / 100);
            }
            return sum + (b.discountValue || 0);
        }, 0);

        // Payment mode breakdown
        const paymentModeMap = {};
        for (const bill of todayBills) {
            const mode = (bill.paymentMode || 'Unknown').toUpperCase();
            paymentModeMap[mode] = (paymentModeMap[mode] || 0) + (bill.total || 0);
        }
        const paymentModes = Object.entries(paymentModeMap).map(([mode, amount]) => ({ mode, amount }));

        // Revenue Stream (paymentBy from patients visited today)
        const todayVisitPatients = await db.all(
            `SELECT DISTINCT p.paymentBy FROM visits v
             JOIN patients p ON v.uhid = p.uhid
             WHERE v.date = ?`, [today]
        );
        const revenueStreamMap = {};
        for (const row of todayVisitPatients) {
            const stream = row.paymentBy || 'Self';
            revenueStreamMap[stream] = (revenueStreamMap[stream] || 0) + 1;
        }
        const revenueStreams = Object.entries(revenueStreamMap).map(([stream, count]) => ({ stream, count }));

        // ===================== 2. PATIENT DEMOGRAPHICS =====================

        // Patients visited today (including old patients)
        const todayVisits = await db.all(
            `SELECT v.uhid, v.date as visitDate, v.visitCount, p.sex, p.age, p.referredBy, p.purposeOfVisit,
                    p.state, p.city, p.date as regDate, p.userType
             FROM visits v
             JOIN patients p ON v.uhid = p.uhid
             WHERE v.date = ?`, [today]
        );
        const totalPatientCount = todayVisits.length;
        const newPatientCount = todayVisits.filter(v => v.visitCount === 1).length;
        const oldPatientCount = todayVisits.filter(v => v.visitCount > 1).length;

        // Gender demographics
        const genderMap = {};
        for (const v of todayVisits) {
            const g = v.sex || 'Unknown';
            genderMap[g] = (genderMap[g] || 0) + 1;
        }
        const genderDemographics = Object.entries(genderMap).map(([gender, count]) => ({
            gender,
            count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        }));

        // Age Demographics
        const ageGroups = { '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '51-60': 0, '61+': 0, 'Unknown': 0 };
        for (const v of todayVisits) {
            const age = parseInt(v.age) || null;
            if (!age) { ageGroups['Unknown']++; }
            else if (age <= 10) { ageGroups['0-10']++; }
            else if (age <= 20) { ageGroups['11-20']++; }
            else if (age <= 30) { ageGroups['21-30']++; }
            else if (age <= 40) { ageGroups['31-40']++; }
            else if (age <= 50) { ageGroups['41-50']++; }
            else if (age <= 60) { ageGroups['51-60']++; }
            else { ageGroups['61+']++; }
        }
        const ageDemographics = Object.entries(ageGroups)
            .filter(([_, count]) => count > 0)
            .map(([ageGroup, count]) => ({
                ageGroup,
                count,
                percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
            }));

        // Purpose of Visit
        const purposeMap = {};
        for (const v of todayVisits) {
            const p = v.purposeOfVisit || 'Not Specified';
            purposeMap[p] = (purposeMap[p] || 0) + 1;
        }
        const purposeOfVisit = Object.entries(purposeMap)
            .map(([purpose, count]) => ({ purpose, count }))
            .sort((a, b) => b.count - a.count);

        // Patient Acquisition Source (referredBy)
        const referralMap = {};
        for (const v of todayVisits) {
            const ref = v.referredBy || 'Self';
            referralMap[ref] = (referralMap[ref] || 0) + 1;
        }
        const acquisitionSources = Object.entries(referralMap).map(([source, count]) => ({
            source,
            count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        }));

        // Geographic Reach - state-wise
        const stateMap = {};
        for (const v of todayVisits) {
            const state = v.state || 'Not Specified';
            stateMap[state] = (stateMap[state] || 0) + 1;
        }
        const geographicReach = Object.entries(stateMap)
            .map(([location, count]) => ({
                location,
                count,
                percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count);

        // ===================== 3. MEDICINE ANALYTICS =====================

        // Get all prescriptions for today's visits
        const todayPrescriptions = await db.all(
            `SELECT pr.medicineName, pr.type
             FROM prescriptions pr
             JOIN visits v ON pr.visit_id = v.id
             WHERE v.date = ?`, [today]
        );

        const totalMedicinePrescribed = todayPrescriptions.length;

        // Medicine type breakdown
        const medTypeMap = {};
        for (const p of todayPrescriptions) {
            const t = p.type || 'Unknown';
            medTypeMap[t] = (medTypeMap[t] || 0) + 1;
        }
        const medicineTypes = Object.entries(medTypeMap).map(([type, count]) => ({
            type,
            count,
            percentage: totalMedicinePrescribed > 0 ? Math.round((count / totalMedicinePrescribed) * 100) : 0
        }));

        // Top 10 medicines prescribed today
        const medNameMap = {};
        for (const p of todayPrescriptions) {
            const name = p.medicineName || 'Unknown';
            if (!medNameMap[name]) medNameMap[name] = { count: 0, type: p.type || 'Unknown' };
            medNameMap[name].count++;
        }
        const top10Medicines = Object.entries(medNameMap)
            .map(([name, data]) => ({
                name,
                type: data.type,
                count: data.count,
                percentage: totalMedicinePrescribed > 0 ? Math.round((data.count / totalMedicinePrescribed) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Full prescribed medicine list for today (ordered by count desc)
        const medicineListMap = {};
        for (const p of todayPrescriptions) {
            const name = p.medicineName || 'Unknown';
            if (!medicineListMap[name]) medicineListMap[name] = { count: 0, type: p.type || 'Unknown' };
            medicineListMap[name].count++;
        }
        const todayMedicineList = Object.entries(medicineListMap)
            .map(([name, data], idx) => ({
                srNo: idx + 1,
                medicineName: name,
                medicineType: data.type,
                count: data.count
            }))
            .sort((a, b) => b.count - a.count)
            .map((item, idx) => ({ ...item, srNo: idx + 1 }));

        res.json({
            date: today,
            revenue: {
                totalRevenue,
                avgTransaction,
                totalDiscount,
                paymentModes,
                revenueStreams
            },
            patientDemographics: {
                totalPatientCount,
                newPatientCount,
                oldPatientCount,
                genderDemographics,
                ageDemographics,
                purposeOfVisit,
                acquisitionSources,
                geographicReach
            },
            medicineAnalytics: {
                totalMedicinePrescribed,
                medicineTypes,
                top10Medicines,
                todayMedicineList
            }
        });

    } catch (e) {
        console.error('Analytics error:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/analytics/overall - All-time analytics data
router.get('/overall', async (req, res) => {
    try {
        const db = await getDB();
        const { startDate, endDate } = req.query;

        // --- REVENUE ---
        let billsQuery = 'SELECT * FROM bills';
        let billsParams = [];
        if (startDate && endDate) {
            billsQuery += ' WHERE date >= ? AND date <= ?';
            billsParams.push(startDate, endDate);
        }
        const allBills = await db.all(billsQuery, billsParams);
        const totalRevenue = allBills.reduce((s, b) => s + (b.total || 0), 0);
        const avgTransaction = allBills.length > 0 ? totalRevenue / allBills.length : 0;
        const totalDiscount = allBills.reduce((s, b) => s + (b.discountValue || 0), 0);

        const paymentModeMap = {};
        for (const b of allBills) {
            const mode = (b.paymentMode || 'Unknown').toUpperCase();
            paymentModeMap[mode] = (paymentModeMap[mode] || 0) + (b.total || 0);
        }
        const paymentModes = Object.entries(paymentModeMap).map(([mode, amount]) => ({ mode, amount }));

        let patientsQuery = `
            SELECT v.uhid, v.date as visitDate, v.visitCount, p.paymentBy, p.sex, p.age, p.referredBy, p.purposeOfVisit, p.state, p.userType
            FROM visits v
            JOIN patients p ON v.uhid = p.uhid
        `;
        let patientsParams = [];
        if (startDate && endDate) {
            patientsQuery += ' WHERE v.date >= ? AND v.date <= ?';
            patientsParams.push(startDate, endDate);
        }
        const allPatients = await db.all(patientsQuery, patientsParams);
        const revenueStreamMap = {};
        for (const p of allPatients) {
            const stream = p.paymentBy || 'Self';
            revenueStreamMap[stream] = (revenueStreamMap[stream] || 0) + 1;
        }
        const revenueStreams = Object.entries(revenueStreamMap).map(([stream, count]) => ({ stream, count }));

        // --- PATIENT DEMOGRAPHICS ---
        const totalPatientCount = allPatients.length;
        const newPatientCount = allPatients.filter(v => v.visitCount === 1).length;
        const oldPatientCount = allPatients.filter(v => v.visitCount > 1).length;

        const genderMap = {};
        for (const p of allPatients) {
            const g = p.sex || 'Unknown';
            genderMap[g] = (genderMap[g] || 0) + 1;
        }
        const genderDemographics = Object.entries(genderMap).map(([gender, count]) => ({
            gender, count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        }));

        const ageGroups = { '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '51-60': 0, '61+': 0, 'Unknown': 0 };
        for (const p of allPatients) {
            const age = parseInt(p.age) || null;
            if (!age) ageGroups['Unknown']++;
            else if (age <= 10) ageGroups['0-10']++;
            else if (age <= 20) ageGroups['11-20']++;
            else if (age <= 30) ageGroups['21-30']++;
            else if (age <= 40) ageGroups['31-40']++;
            else if (age <= 50) ageGroups['41-50']++;
            else if (age <= 60) ageGroups['51-60']++;
            else ageGroups['61+']++;
        }
        const ageDemographics = Object.entries(ageGroups).filter(([_, c]) => c > 0).map(([ageGroup, count]) => ({
            ageGroup, count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        }));

        const purposeMap = {};
        for (const p of allPatients) {
            const pv = p.purposeOfVisit || 'Not Specified';
            purposeMap[pv] = (purposeMap[pv] || 0) + 1;
        }
        const purposeOfVisit = Object.entries(purposeMap).map(([purpose, count]) => ({ purpose, count })).sort((a, b) => b.count - a.count);

        const referralMap = {};
        for (const p of allPatients) {
            const ref = p.referredBy || 'Self';
            referralMap[ref] = (referralMap[ref] || 0) + 1;
        }
        const acquisitionSources = Object.entries(referralMap).map(([source, count]) => ({
            source, count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        }));

        const stateMap = {};
        for (const p of allPatients) {
            const state = p.state || 'Not Specified';
            stateMap[state] = (stateMap[state] || 0) + 1;
        }
        const geographicReach = Object.entries(stateMap).map(([location, count]) => ({
            location, count,
            percentage: totalPatientCount > 0 ? Math.round((count / totalPatientCount) * 100) : 0
        })).sort((a, b) => b.count - a.count);

        // --- MEDICINE ANALYTICS ---
        let prescriptionsQuery = `
            SELECT pr.medicineName, pr.type
            FROM prescriptions pr
            JOIN visits v ON pr.visit_id = v.id
        `;
        let prescriptionsParams = [];
        if (startDate && endDate) {
            prescriptionsQuery += ' WHERE v.date >= ? AND v.date <= ?';
            prescriptionsParams.push(startDate, endDate);
        }
        const allPrescriptions = await db.all(prescriptionsQuery, prescriptionsParams);
        const totalMedicinePrescribed = allPrescriptions.length;

        const medTypeMap = {};
        for (const p of allPrescriptions) {
            const t = p.type || 'Unknown';
            medTypeMap[t] = (medTypeMap[t] || 0) + 1;
        }
        const medicineTypes = Object.entries(medTypeMap).map(([type, count]) => ({
            type, count,
            percentage: totalMedicinePrescribed > 0 ? Math.round((count / totalMedicinePrescribed) * 100) : 0
        }));

        const medNameMap = {};
        for (const p of allPrescriptions) {
            const name = p.medicineName || 'Unknown';
            if (!medNameMap[name]) medNameMap[name] = { count: 0, type: p.type || 'Unknown' };
            medNameMap[name].count++;
        }
        const top10Medicines = Object.entries(medNameMap)
            .map(([name, data]) => ({ name, type: data.type, count: data.count, percentage: totalMedicinePrescribed > 0 ? Math.round((data.count / totalMedicinePrescribed) * 100) : 0 }))
            .sort((a, b) => b.count - a.count).slice(0, 10);

        const allMedicineList = Object.entries(medNameMap)
            .map(([name, data]) => ({ medicineName: name, medicineType: data.type, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .map((item, idx) => ({ srNo: idx + 1, ...item }));

        res.json({
            revenue: { totalRevenue, avgTransaction, totalDiscount, paymentModes, revenueStreams },
            patientDemographics: { totalPatientCount, newPatientCount, oldPatientCount, genderDemographics, ageDemographics, purposeOfVisit, acquisitionSources, geographicReach },
            medicineAnalytics: { totalMedicinePrescribed, medicineTypes, top10Medicines, todayMedicineList: allMedicineList }
        });

    } catch (e) {
        console.error('Overall analytics error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

