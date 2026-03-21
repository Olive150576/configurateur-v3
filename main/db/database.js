/**
 * Database — Singleton SQLite
 * Gère la connexion, les migrations, et l'accès à la base
 */

const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

// Chemin du fichier SQLite — défini par index.js après app.whenReady()
function getDbPath() {
  return dbPath;
}

/**
 * Initialise la base et applique les migrations
 * @param {string} resolvedPath - Chemin absolu du fichier SQLite
 */
function initDatabase(resolvedPath) {
  const Database = require('better-sqlite3');
  dbPath = resolvedPath;
  console.log('📂 Base de données:', dbPath);

  db = new Database(dbPath);

  // Performances et intégrité
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Appliquer les migrations
  runMigrations();

  return db;
}

/**
 * Retourne l'instance DB (doit être initialisée)
 */
function getDb() {
  if (!db) throw new Error('Base de données non initialisée');
  return db;
}

/**
 * Système de migrations versionnées
 */
function runMigrations() {
  // Créer la table de migrations si elle n'existe pas
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const migrations = loadMigrations();
  const applied = db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version);

  for (const migration of migrations) {
    if (!applied.includes(migration.version)) {
      console.log(`⚙️  Migration ${migration.version}...`);
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      console.log(`✓ Migration ${migration.version} appliquée`);
    }
  }
}

/**
 * Charge les migrations depuis le dossier migrations/
 */
function loadMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(file => {
    const version = parseInt(file.split('_')[0]);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    return { version, file, sql };
  });
}

/**
 * Backup de la base (copie atomique SQLite)
 */
async function backupDatabase(destPath) {
  await db.backup(destPath);
}

module.exports = { initDatabase, getDb, backupDatabase, getDbPath };
