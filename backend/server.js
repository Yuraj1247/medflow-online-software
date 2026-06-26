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
const allowedOrigins = (process.env.NODE_ENV === 'production')
    ? [process.env.FRONTEND_URL].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000'].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'));
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(bodyParser.json());

// Rate Limiting
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: { message: 'Too many OTP requests. Please try again after 10 minutes.' }
});

const developerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Too many developer verification attempts. Please try again after 15 minutes.' }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/developer/verify-otp', developerLimiter);
app.use('/api/developer/request-otp', otpLimiter);
app.use('/api/developer/request-delete-otp', otpLimiter);

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

const packageJson = require('./package.json');
const startTime = Date.now();

const getHealthStatus = async () => {
    let dbStatus = 'connected';
    try {
        const { getDB } = require('./database');
        const db = await getDB();
        await db.get('SELECT 1');
    } catch (err) {
        dbStatus = 'disconnected';
    }
    return {
        status: 'OK',
        message: 'MedFlow Backend Running',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        database: dbStatus
    };
};

app.get('/health', async (req, res) => {
    const health = await getHealthStatus();
    res.json(health);
});

app.get('/api/health', async (req, res) => {
    const health = await getHealthStatus();
    res.json(health);
});

app.get('/api/version', (req, res) => {
    res.json({
        version: packageJson.version || '1.0.0'
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

// Serve frontend conditionally in non-production environments
if (process.env.NODE_ENV !== 'production') {
    const frontendPath = path.join(__dirname, '../frontend/dist');
    app.use(express.static(frontendPath));

    app.get(/^\/(.*)/, (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
            if (err) {
                next();
            }
        });
    });
}

// Catch-all for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found'
    });
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
