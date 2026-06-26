# MedFlow HMS Online 🏥

A modern, production-ready, cloud-based **Hospital Management System (HMS)** designed for clinics, medical practitioners, and hospitals. Originally built as an offline desktop application, this version is modernized to support secure, high-performance web deployment.

Designed and Developed by **DesignAura Studios**  
Lead Developer: **Yuraj Chinarathod**  
GitHub Repository: [https://github.com/Yuraj1247/medflow-online-software](https://github.com/Yuraj1247/medflow-online-software)

---

## 🚀 Key Features

*   **Multi-Role Access Control**: Secure login mechanisms for **Admin**, **Doctor (Consultant)**, and **Receptionist** roles with JWT-based session protection.
*   **Patient Records Management**: Complete demographics tracking, clinical history, and persistent visit count logs.
*   **Clinical Consultations & Vitals**: Record patient complaints, clinical findings, history, diagnosis, next visit dates, and real-time vital stats (BP, SpO2, Pulse, Temp, BMI).
*   **Digital Prescriptions**: Generate fully customized Rx prescriptions mapped dynamically to patient visits.
*   **Smart Billing & Invoices**: Flexible invoice creation with automated discount calculations, GST tax integration, customizable particulars, and payment mode configurations.
*   **Clinic / Hospital Settings**: Complete clinic customization (Logo, letterheads, state-city dropdowns, custom billing rates, GST settings, and receipt footer text).
*   **Developer Controls**: Dynamic subscription locking (lifetime/trial configurations), secure system reset functions, and OTP-verified administrative security.
*   **PostgreSQL Migration**: Fully integrated with standard PostgreSQL backend (Supabase compatible) replacing the legacy SQLite adapter.
*   **Database Import / Export**: Fast SQL serialization to download backward-compatible `.sqlite` backups or restore system records on-the-fly.
*   **Security & Hardening**:
    *   Bcrypt password hashing with `12` salt rounds.
    *   CORS origin checks and secure request routing.
    *   Express Rate Limiting protection on authentication endpoints.
    *   Unified audit log database trail capturing logins, billing, settings adjustments, and clinical operations.

---

## 🛠️ Technology Stack

*   **Frontend**: React (Vite), TypeScript, TailwindCSS-inspired Vanilla UI Components, Framer Motion (Transitions), Recharts (Analytics).
*   **Backend**: Node.js, Express, PostgreSQL Connection Pool (`pg`), JWT (JsonWebTokens), Nodemailer (Developer Mailer Notification).
*   **Database**: Supabase PostgreSQL.
*   **Deployments**: Vercel (Frontend), Render (Backend).

---

## 📁 Folder Structure

```
medflow-online-software/
├── frontend/                 # Client React Application (Vite + TS)
│   ├── src/
│   │   ├── components/       # Premium Reusable UI Controls
│   │   ├── pages/            # Core views (AdminPanel, Billing, Doctor, PatientForm, etc.)
│   │   ├── services/         # API integration & State adapters
│   │   └── types.ts          # Strongly typed entity schema definitions
│   └── package.json
│
├── backend/                  # Server Node.js Application (Express)
│   ├── middleware/           # JWT verification & Subscription validation
│   ├── routes/               # API Router endpoints (auth, patients, bills, developer, etc.)
│   ├── database.js           # PostgreSQL connector & casing normalization adapter
│   ├── migrate.js            # Standalone SQLite-to-PostgreSQL migrator tool
│   ├── server.js             # Main server entrypoint
│   └── package.json
│
├── package.json              # Monorepo task runner configurations
└── README.md                 # Project documentation
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)
Create a `.env` file inside the `backend/` directory:
```env
PORT=5000
DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/postgres
JWT_SECRET=your_long_secure_jwt_session_secret
GMAIL_USER=your_smtp_sender_email@gmail.com
GMAIL_PASS=your_smtp_sender_app_password
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=your_admin_setup_password
DEFAULT_ADMIN_NAME=Administrator
DEFAULT_DEVELOPER_EMAIL=developer@domain.com
DEFAULT_DEVELOPER_ACCESS_CODE=your_developer_otp_passcode
FRONTEND_URL=https://your-frontend-service.vercel.app
```

### Frontend (`frontend/.env`)
Create a `.env` file inside the `frontend/` directory:
```env
VITE_API_URL=https://your-backend-service.onrender.com/api
```

---

## 🔧 Installation & Local Development

### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn
*   PostgreSQL database (local instance or Supabase project)

### Step 1: Install Dependencies
From the root directory, run:
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Step 2: Running the Application
To launch both frontend and backend concurrently in development mode, run:
```bash
npm run dev
```
*   **Frontend Client**: [http://localhost:5173](http://localhost:5173)
*   **Backend Server**: [http://localhost:5000](http://localhost:5000)

### Step 3: Local SQLite Migration (Optional)
If you have a legacy SQLite database (`database.sqlite`) to import, place the file inside the `backend/` folder and execute:
```bash
cd backend
node migrate.js
```

---

## ☁️ Deployment Guides

### Database (Supabase)
1.  Initialize a new project in [Supabase](https://supabase.com/).
2.  Retrieve your connection string from **Settings > Database > Connection Strings (URI)**.
3.  Set this value as the `DATABASE_URL` in your backend deployment.

### Backend (Render Web Service)
1.  Connect your repository to [Render](https://render.com/).
2.  Configure a new Web Service:
    *   **Root Directory**: `backend`
    *   **Build Command**: `npm install`
    *   **Start Command**: `npm start`
3.  Populate all Environment Variables in Render's configuration dashboard.

### Frontend (Vercel)
1.  Deploy a new project in [Vercel](https://vercel.com/) pointing to your repository.
2.  Configure the build options:
    *   **Root Directory**: `frontend`
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist`
3.  Add the environment variable `VITE_API_URL` pointing to your deployed Render API (e.g. `https://medflow-api.onrender.com/api`).

---

## 📄 License

This project is proprietary software. All rights reserved.

---

Designed and Developed by **DesignAura Studios**  
Lead Developer: **Yuraj Chinarathod**  
GitHub: [@Yuraj1247](https://github.com/Yuraj1247)
