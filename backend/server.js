const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');

const cors = require('cors');
const bodyParser = require('body-parser');
const { initDB } = require('./database');
// path already imported above

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes Imports
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const patientRoutes = require('./routes/patients');
const visitRoutes = require('./routes/visits'); // Includes prescriptions
const medicineRoutes = require('./routes/medicines');
const billRoutes = require('./routes/bills');
const masterRoutes = require('./routes/master');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const developerRoutes = require('./routes/developer');
const databaseRoutes = require('./routes/database');
const doctorRoutes = require('./routes/doctor');
const analyticsRoutes = require('./routes/analytics');
const digilockerRoutes = require('./routes/digilocker');

// Middleware Import
const { checkSubscription, verifySubscription } = require('./middleware/subscriptionMiddleware');

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        dbPath: require('./database').DB_PATH,
        time: new Date().toISOString(),
        ip: req.ip
    });
});

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/developer', developerRoutes);

// Protected Routes (Subscription Enforced)
app.use('/api/patients', checkSubscription, patientRoutes);
app.use('/api/visits', checkSubscription, visitRoutes);
app.use('/api/medicines', checkSubscription, medicineRoutes);
app.use('/api/bills', checkSubscription, billRoutes);
app.use('/api/master', checkSubscription, masterRoutes);
app.use('/api/database', checkSubscription, databaseRoutes);
app.use('/api/users', checkSubscription, userRoutes);
app.use('/api/dashboard', checkSubscription, dashboardRoutes);
app.use('/api/doctor', checkSubscription, doctorRoutes);
app.use('/api/analytics', checkSubscription, analyticsRoutes);
app.use('/api/digilocker', checkSubscription, digilockerRoutes);

// SPA Catch-all (Non-API GET requests)
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

app.get('/{*path}', (req, res) => {
    // If it's an API request that reached here, it's a 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        details: err
    });
});

// Initialize DB and Start Server
initDB().then(async () => {
    // Check subscription on startup
    const subStatus = await verifySubscription();
    console.log(`Subscription Status: ${subStatus.status}${subStatus.reason ? ` (${subStatus.reason})` : ''}`);

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log(`Ready for LAN connections.`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
});
