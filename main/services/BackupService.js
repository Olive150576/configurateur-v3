/**
 * BackupService — Sauvegarde et restauration
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { backupDatabase, getDbPath, getDb } = require('../db/database');

function getBackupDir() {
  return path.join(app.getPath('userData'), 'backups');
}

/**
 * Crée un backup horodaté
 */
async function backup() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destPath = path.join(dir, `configurateur-${date}.db`);

  await backupDatabase(destPath);

  // Garder seulement les 30 derniers backups
  pruneOldBackups(30);

  return destPath;
}

/**
 * Liste les backups disponibles
 */
function getBackups() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return { name: f, path: fullPath, size: stat.size, date: stat.mtime };
    })
    .sort((a, b) => b.date - a.date);
}

/**
 * Supprime les anciens backups au-delà du nombre max
 */
function pruneOldBackups(maxCount) {
  const backups = getBackups();
  if (backups.length > maxCount) {
    backups.slice(maxCount).forEach(b => {
      try { fs.unlinkSync(b.path); } catch (e) { /* ignore */ }
    });
  }
}

/**
 * Restaure une sauvegarde :
 * 1. Crée une sauvegarde de sécurité
 * 2. Ferme la base de données
 * 3. Copie le fichier de sauvegarde sur la base active
 * 4. Relance l'application
 */
async function restore(fileName) {
  const dir      = getBackupDir();
  const srcPath  = path.join(dir, fileName);

  if (!fs.existsSync(srcPath)) throw new Error(`Sauvegarde introuvable : ${fileName}`);

  // 1. Sauvegarde de sécurité avant restauration
  await backup();

  // 2. Fermer la base
  const db = getDb();
  db.close();

  // 3. Copier le fichier
  const destPath = getDbPath();
  fs.copyFileSync(srcPath, destPath);

  // 4. Relancer l'application
  app.relaunch();
  app.exit(0);
}

module.exports = { backup, getBackups, restore };
