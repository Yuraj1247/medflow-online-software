MedFlow Hospital Management System - Electron App

HOW TO RUN (Development):
-------------------------
1. Run 'npm install' in the root directory.
2. Run 'npm run dev' to start the app in development mode with hot-reload.

HOW TO BUILD (Create EXE):
--------------------------
1. Run 'npm run dist' in the root directory.
2. This will generate a 'dist-electron' folder.
3. Inside 'dist-electron', you will find 'MedFlow_HMS_Setup_1.0.0.exe'.
4. Run this installer to install the software on any Windows PC.

LAN ACCESS:
-----------
To access from other computers on the same network:
1. Find the IP Address of the server computer (e.g., 192.168.1.10).
2. Open Chrome/Edge on the other computer.
3. Visit: http://192.168.1.10:5000

DATABASE:
---------
All data is stored in 'database.sqlite'. 
The app will automatically look for this file in its installation directory.
Ensure you back up this file regularly.

TROUBLESHOOTING:
----------------
- Port 5000 must be free for the backend to start.
- Ensure Firewall allows port 5000 for LAN access.
