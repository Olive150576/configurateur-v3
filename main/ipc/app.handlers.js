/**
 * IPC Handlers — Application (config, backup, stats)
 */

const { getDb, getDbPath, backupDatabase } = require('../db/database');
const BackupService = require('../services/BackupService');
const { dialog, app, BrowserWindow } = require('electron');
const fs   = require('fs');
const path = require('path');

function register(ipcMain) {
  // Version
  ipcMain.handle('app:getVersion', () => ({ ok: true, data: app.getVersion() }));

  // Backup
  ipcMain.handle('app:backup',     () => wrap(() => BackupService.backup()));
  ipcMain.handle('app:getBackups', () => wrap(() => BackupService.getBackups()));
  ipcMain.handle('app:restore',    (_, file) => wrap(() => BackupService.restore(file)));

  // Export DB vers un emplacement choisi par l'utilisateur
  ipcMain.handle('app:exportDb', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const date = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exporter les données',
      defaultPath: `configurateur-export-${date}.db`,
      filters: [{ name: 'Base de données', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { exported: false };
    await backupDatabase(filePath);
    return { exported: true, path: filePath };
  });

  // Import DB depuis un fichier choisi par l'utilisateur
  ipcMain.handle('app:importDb', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importer les données',
      filters: [{ name: 'Base de données', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { imported: false };

    // Sauvegarde de sécurité avant écrasement
    await BackupService.backup();

    const db = getDb();
    db.close();

    fs.copyFileSync(filePaths[0], getDbPath());

    app.relaunch();
    app.exit(0);
    return { imported: true };
  });

  // Statut sauvegarde automatique
  ipcMain.handle('app:getAutoBackupStatus', () => wrap(() => {
    const db = getDb();
    const get = (key, def) => { const r = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key); return r ? r.value : def; };
    return {
      enabled:        get('auto_backup_enabled', 'true') === 'true',
      time:           get('auto_backup_time', '20:00'),
      retentionDays:  parseInt(get('auto_backup_retention_days', '30')) || 30,
      lastBackupDate: get('last_auto_backup_date', ''),
      lastBackupTime: get('last_auto_backup_time', ''),
    };
  }));

  // Config
  ipcMain.handle('app:getConfig', (_, key) => wrap(() => {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    return row ? row.value : null;
  }));

  ipcMain.handle('app:setConfig', (_, key, value) => wrap(() => {
    const db = getDb();
    db.prepare(`
      INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value));
    return true;
  }));

  // Stats globales (menu simple)
  ipcMain.handle('app:getStats', () => wrap(() => {
    const db = getDb();
    return {
      products:  db.prepare('SELECT COUNT(*) as n FROM products WHERE archived = 0').get().n,
      clients:   db.prepare('SELECT COUNT(*) as n FROM clients').get().n,
      documents: db.prepare('SELECT COUNT(*) as n FROM documents').get().n,
      drafts:    db.prepare("SELECT COUNT(*) as n FROM documents WHERE status = 'draft'").get().n,
    };
  }));

  // Dashboard enrichi
  ipcMain.handle('app:getDashboard', () => wrap(() => {
    const db = getDb();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    const products      = db.prepare('SELECT COUNT(*) as n FROM products WHERE archived = 0').get().n;
    const clients       = db.prepare('SELECT COUNT(*) as n FROM clients').get().n;
    const documents     = db.prepare("SELECT COUNT(*) as n FROM documents WHERE status != 'archived'").get().n;
    const drafts        = db.prepare("SELECT COUNT(*) as n FROM documents WHERE status = 'draft'").get().n;
    const pendingQuotes = db.prepare(`
      SELECT COUNT(*) as n FROM documents
      WHERE type IN ('devis','offre') AND status IN ('validated','sent')
    `).get().n;
    const activeOrders  = db.prepare(`
      SELECT COUNT(*) as n FROM documents WHERE type = 'commande' AND status = 'ordered'
    `).get().n;
    const revenueMonth  = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM documents
      WHERE type = 'commande' AND status = 'ordered' AND ordered_at >= ?
    `).get(monthStart).total;
    const revenueTotal  = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM documents
      WHERE type = 'commande' AND status = 'ordered'
    `).get().total;

    const alertDaysRow = db.prepare("SELECT value FROM app_config WHERE key = 'alert_days'").get();
    const alertDays    = parseInt(alertDaysRow?.value ?? 15) || 15;
    const overdueQuotes = db.prepare(`
      SELECT COUNT(*) as n FROM documents
      WHERE type IN ('devis','offre') AND status IN ('validated','sent')
        AND validated_at <= datetime('now', '-' || ? || ' days')
    `).get(String(alertDays)).n;

    const recentDocs = db.prepare(`
      SELECT d.id, d.number, d.type, d.status, d.total, d.created_at, c.name as client_name
      FROM documents d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.status != 'archived'
      ORDER BY d.created_at DESC LIMIT 7
    `).all();

    const recentClients = db.prepare(`
      SELECT id, name, company, email, created_at FROM clients ORDER BY created_at DESC LIMIT 5
    `).all();

    // Liste détaillée des devis en retard de relance
    const overdueList = db.prepare(`
      SELECT d.id, d.number, d.type, d.status, d.total, d.validated_at,
             c.name as client_name,
             CAST(julianday('now') - julianday(d.validated_at) AS INTEGER) as days_waiting
      FROM documents d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.type IN ('devis','offre') AND d.status IN ('validated','sent')
        AND d.validated_at <= datetime('now', '-' || ? || ' days')
      ORDER BY d.validated_at ASC
    `).all(String(alertDays));

    return { products, clients, documents, drafts, pendingQuotes, activeOrders,
             revenueMonth, revenueTotal, overdueQuotes, overdueList, alertDays,
             recentDocs, recentClients };
  }));
}

module.exports = { register };
