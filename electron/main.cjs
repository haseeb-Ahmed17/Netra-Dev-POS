const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:3000';
let mainWindow = null;
let customerDisplayWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Khaas Retail / SmartBitz POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'production') {
    mainWindow.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.close();
    }
  });
}

ipcMain.handle('pos:open-customer-display', () => {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.focus();
    return { opened: true };
  }
  customerDisplayWindow = new BrowserWindow({
    width: 900,
    height: 640,
    title: 'Customer Display — SmartBitz POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'production') {
    customerDisplayWindow.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'), {
      search: 'display=customer',
    });
  } else {
    customerDisplayWindow.loadURL(`${DEV_SERVER_URL}/?display=customer`);
  }

  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null;
  });
  return { opened: true };
});

ipcMain.handle('pos:print-silent', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'Main POS window unavailable' };
  }
  return new Promise((resolve) => {
    mainWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      resolve({ ok: success, error: failureReason || null });
    });
  });
});

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
