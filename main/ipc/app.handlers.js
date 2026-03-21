/**
 * IPC Handlers — Application (config, backup, stats)
 */

const { getDb } = require('../db/database');
const BackupService = require('../services/BackupService');

function register(ipcMain) {
  // Backup
  ipcMain.handle('app:backup',     () => wrap(() => BackupService.backup()));
  ipcMain.handle('app:getBackups', () => wrap(() => BackupService.getBackups()));

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

  // Stats globales
  ipcMain.handle('app:getStats', () => wrap(() => {
    const db = getDb();
    return {
      products:  db.prepare('SELECT COUNT(*) as n FROM products WHERE archived = 0').get().n,
      clients:   db.prepare('SELECT COUNT(*) as n FROM clients').get().n,
      documents: db.prepare('SELECT COUNT(*) as n FROM documents').get().n,
      drafts:    db.prepare("SELECT COUNT(*) as n FROM documents WHERE status = 'draft'").get().n,
    };
  }));
}

module.exports = { register };
