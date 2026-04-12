/**
 * Main process Electron — Point d'entrée
 */

const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

// Charger les variables d'environnement (.env) avant tout require de service
require('dotenv').config({
  path: app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '..', '.env'),
});
const { initDatabase } = require('./db/database');
const { autoUpdater } = require('electron-updater');

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

  // Vérification des mises à jour (30s après démarrage pour ne pas bloquer le démarrage)
  setTimeout(() => checkForUpdates(), 30000);
});

// ── Auto-updater ──────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.logger = console;

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function checkForUpdates() {
  if (!app.isPackaged) {
    console.log('[Updater] App non packagée, vérification ignorée');
    return;
  }
  console.log('[Updater] Vérification des mises à jour…');
  autoUpdater.checkForUpdates().catch(err => {
    console.error('[Updater] Erreur checkForUpdates:', err.message);
    sendToMain('update:error', { message: err.message });
  });
}

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Vérification en cours…');
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Mise à jour disponible:', info.version);
  sendToMain('update:available', { version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[Updater] Pas de mise à jour (version actuelle:', info.version, ')');
});

autoUpdater.on('download-progress', (progress) => {
  sendToMain('update:progress', { percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', () => {
  console.log('[Updater] Mise à jour téléchargée, prête à installer');
  sendToMain('update:ready');
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Erreur:', err.message);
  sendToMain('update:error', { message: err.message });
});

ipcMain.handle('update:check',    () => wrap(() => { checkForUpdates(); return { checking: true }; }));
ipcMain.handle('update:download', () => wrap(() => { autoUpdater.downloadUpdate(); return { downloading: true }; }));
ipcMain.handle('update:install',  () => { autoUpdater.quitAndInstall(); });
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
