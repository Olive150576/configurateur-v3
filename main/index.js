/**
 * Main process Electron — Point d'entrée
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initDatabase } = require('./db/database');

// Fonction wrap globale pour les handlers IPC
require('./ipc/wrap');

// Handlers IPC
const productHandlers  = require('./ipc/product.handlers');
const documentHandlers = require('./ipc/document.handlers');
const clientHandlers   = require('./ipc/client.handlers');
const supplierHandlers = require('./ipc/supplier.handlers');
const appHandlers      = require('./ipc/app.handlers');
const printHandlers    = require('./ipc/print.handlers');
const statsHandlers    = require('./ipc/stats.handlers');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Configurateur V3',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/menu/index.html'));

  // Ouvrir DevTools en mode dev
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Initialiser la base de données
  try {
    const dbPath = require('path').join(app.getPath('userData'), 'configurateur.db');
    initDatabase(dbPath);
    console.log('✓ Base de données initialisée');
  } catch (error) {
    console.error('❌ Erreur base de données:', error);
    app.quit();
    return;
  }

  // Enregistrer les handlers IPC
  productHandlers.register(ipcMain);
  documentHandlers.register(ipcMain);
  clientHandlers.register(ipcMain);
  supplierHandlers.register(ipcMain);
  appHandlers.register(ipcMain);
  printHandlers.register(ipcMain);
  statsHandlers.register(ipcMain);

  // Démarrer le scheduler de sauvegarde automatique
  const BackupScheduler = require('./services/BackupScheduler');
  BackupScheduler.start();

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
