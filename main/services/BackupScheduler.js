/**
 * BackupScheduler — Sauvegarde automatique planifiée
 * Vérifie toutes les minutes si une sauvegarde doit être effectuée.
 * Critères : activée + heure atteinte + pas encore fait aujourd'hui
 */

const { getDb } = require('../db/database');
const BackupService = require('./BackupService');

let _timer = null;

function getConfig(key, defaultValue = '') {
  try {
    const db  = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch { return defaultValue; }
}

function setConfig(key, value) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value));
  } catch (e) { console.error('BackupScheduler setConfig error:', e); }
}

/**
 * Vérifie si une sauvegarde automatique doit être lancée maintenant
 */
async function checkAndBackup() {
  try {
    const enabled = getConfig('auto_backup_enabled', 'true') === 'true';
    if (!enabled) return;

    const backupTime = getConfig('auto_backup_time', '20:00'); // HH:MM
    const now        = new Date();
    const todayStr   = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Vérifier si déjà fait aujourd'hui
    const lastDone = getConfig('last_auto_backup_date', '');
    if (lastDone === todayStr) return;

    // Vérifier si l'heure configurée est atteinte
    const [bHour, bMin] = backupTime.split(':').map(Number);
    if (isNaN(bHour) || isNaN(bMin)) return;

    const nowMinutes  = now.getHours() * 60 + now.getMinutes();
    const backupMinutes = bHour * 60 + bMin;
    if (nowMinutes < backupMinutes) return;

    // Conditions réunies → lancer la sauvegarde
    console.log(`⏰ Sauvegarde automatique déclenchée (${backupTime})…`);
    await BackupService.backup();

    // Appliquer la rétention par jours (si configurée)
    const retentionDays = parseInt(getConfig('auto_backup_retention_days', '30')) || 30;
    pruneByAge(retentionDays);

    // Mémoriser la date du jour
    setConfig('last_auto_backup_date', todayStr);
    setConfig('last_auto_backup_time', now.toISOString());
    console.log('✅ Sauvegarde automatique effectuée');

  } catch (e) {
    console.error('❌ Erreur sauvegarde automatique:', e);
  }
}

/**
 * Supprime les sauvegardes plus anciennes que N jours
 */
function pruneByAge(retentionDays) {
  const BackupService = require('./BackupService');
  const backups = BackupService.getBackups();
  const cutoff  = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const fs      = require('fs');
  backups
    .filter(b => new Date(b.date).getTime() < cutoff)
    .forEach(b => {
      try { fs.unlinkSync(b.path); } catch { /* ignore */ }
    });
}

/**
 * Démarre le scheduler (vérifie toutes les minutes)
 */
function start() {
  if (_timer) return; // déjà démarré
  // Vérification immédiate au démarrage (rattraper une sauvegarde manquée)
  checkAndBackup();
  // Puis toutes les 60 secondes
  _timer = setInterval(checkAndBackup, 60 * 1000);
  console.log('🕐 Scheduler sauvegarde automatique démarré');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, checkAndBackup };
