const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Set process.env.NODE_ENV if not set
process.env.NODE_ENV = app.isPackaged ? 'production' : 'development';

const isDev = !app.isPackaged;

// Start the Express backend
// We use a try-catch to ensure the app doesn't crash if the server fails to start
try {
    require('./backend/server');
} catch (err) {
    console.error('Failed to start backend server:', err);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "MedFlow HMS",
    autoHideMenuBar: false
  });

  // Intercept window.open and open in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    // In development, load the Vite dev server
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    win.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
