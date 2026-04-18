'use strict';

/**
 * MigrationService — Migration one-shot SQLite → Supabase
 * Tourne dans le process Electron (better-sqlite3 compilé pour Electron).
 * Exécuté automatiquement au premier démarrage de la nouvelle version.
 * Flag de contrôle : clé app_config "supabase_migrated_at"
 */

const { getDb }      = require('../db/database');
const { getSupabase } = require('../db/supabase');

const MIGRATION_KEY = 'supabase_docs_migrated_at';

function alreadyMigrated() {
  const db  = getDb();
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(MIGRATION_KEY);
  return !!row;
}

function setMigrated() {
  const db = getDb();
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')
  `).run(MIGRATION_KEY, '');
}

function parseJson(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

async function migrateDocuments(db, sb) {
  const rows = db.prepare('SELECT * FROM documents ORDER BY created_at ASC').all();
  if (!rows.length) { console.log('[Migration] Aucun document à migrer'); return; }

  console.log(`[Migration] ${rows.length} document(s) à migrer vers Supabase…`);

  const mapped = rows.map(d => ({
    id:               d.id,
    number:           d.number           || null,
    type:             d.type,
    status:           d.status,
    client_id:        d.client_id        || null,
    client_snapshot:  parseJson(d.client_snapshot),
    product_snapshot: parseJson(d.product_snapshot),
    subtotal:         d.subtotal         || 0,
    discount_percent: d.discount_percent || 0,
    discount_amount:  d.discount_amount  || 0,
    total:            d.total            || 0,
    deposit_percent:  d.deposit_percent  || 0,
    deposit_amount:   d.deposit_amount   || 0,
    balance:          d.balance          || 0,
    notes:            d.notes            || '',
    parent_id:        d.parent_id        || null,
    composition_svg:  d.composition_svg  || null,
    composition_json: d.composition_json || null,
    product_photo:    d.product_photo    || null,
    validated_at:     d.validated_at     || null,
    ordered_at:       d.ordered_at       || null,
    created_at:       d.created_at,
    updated_at:       d.updated_at,
  }));

  const { error } = await sb.from('documents').upsert(mapped, { onConflict: 'id' });
  if (error) throw new Error(`documents: ${error.message}`);
  console.log(`[Migration] ✅ ${mapped.length} document(s) migrés`);
}

async function migrateCounters(db, sb) {
  let rows = [];
  try { rows = db.prepare('SELECT * FROM document_counters').all(); } catch { return; }
  if (!rows.length) return;

  const { error } = await sb.from('document_counters').upsert(
    rows.map(r => ({ type: r.type, year: r.year, last_number: r.last_number })),
    { onConflict: 'type,year' }
  );
  if (error) throw new Error(`document_counters: ${error.message}`);
  console.log(`[Migration] ✅ ${rows.length} compteur(s) de numérotation migrés`);
}

async function migrateCompositions(db, sb) {
  let rows = [];
  try { rows = db.prepare('SELECT * FROM compositions ORDER BY created_at ASC').all(); } catch { return; }
  if (!rows.length) { console.log('[Migration] Aucune composition à migrer'); return; }

  console.log(`[Migration] ${rows.length} composition(s) à migrer…`);

  // Vérifie les compositions déjà présentes (par nom, car id est SERIAL dans Supabase)
  const { data: existing } = await sb.from('compositions').select('name');
  const existingNames = new Set((existing || []).map(c => c.name));

  const toInsert = rows
    .filter(c => !existingNames.has(c.name))
    .map(c => ({
      name:          c.name,
      product_id:    c.product_id    || null,
      modules_json:  c.modules_json  || '[]',
      thumbnail_svg: c.thumbnail_svg || null,
      created_at:    c.created_at,
      updated_at:    c.updated_at,
    }));

  if (!toInsert.length) {
    console.log('[Migration] Compositions déjà à jour dans Supabase');
    return;
  }

  const { error } = await sb.from('compositions').insert(toInsert);
  if (error) throw new Error(`compositions: ${error.message}`);
  console.log(`[Migration] ✅ ${toInsert.length} composition(s) migrées`);
}

/**
 * Lance la migration si elle n'a pas encore été faite sur ce poste.
 * Appelé dans main/index.js après initDatabase().
 */
async function runIfNeeded() {
  if (alreadyMigrated()) {
    console.log('[Migration] Déjà effectuée sur ce poste — ignorée');
    return;
  }

  console.log('[Migration] Première exécution sur ce poste — migration SQLite → Supabase…');

  const db = getDb();
  const sb = getSupabase();

  // Vérifier que les tables Supabase existent
  const { error: chk } = await sb.from('documents').select('id').limit(1);
  if (chk) {
    console.warn('[Migration] ⚠️  Table "documents" inaccessible dans Supabase');
    console.warn('[Migration] → Exécutez supabase_migration_documents.sql dans Supabase puis relancez');
    return; // Ne pas bloquer l'app
  }

  try {
    await migrateDocuments(db, sb);
    await migrateCounters(db, sb);
    await migrateCompositions(db, sb);
    setMigrated();
    console.log('[Migration] ✅ Migration terminée et marquée sur ce poste');
  } catch (err) {
    console.error('[Migration] ❌ Erreur :', err.message);
    // Ne pas bloquer l'app — on réessaiera au prochain démarrage
  }
}

module.exports = { runIfNeeded };
