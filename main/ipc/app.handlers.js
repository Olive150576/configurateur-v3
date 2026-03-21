/**
 * IPC Handlers — Application (config, backup, stats)
 */

const { getDb } = require('../db/database');
const BackupService = require('../services/BackupService');

function register(ipcMain) {
  // Backup
  ipcMain.handle('app:backup',     () => wrap(() => BackupService.backup()));
  ipcMain.handle('app:getBackups', () => wrap(() => BackupService.getBackups()));
  ipcMain.handle('app:restore',    (_, file) => wrap(() => BackupService.restore(file)));

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

    return { products, clients, documents, drafts, pendingQuotes, activeOrders,
             revenueMonth, revenueTotal, overdueQuotes, recentDocs, recentClients };
  }));
}

module.exports = { register };
