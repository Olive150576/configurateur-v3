/**
 * Script de migration SQLite → Supabase
 * Migre les documents et compositions existants vers Supabase.
 *
 * Usage : node scripts/migrate_to_supabase.js
 *
 * Prérequis : les tables documents, document_counters et compositions
 * doivent exister dans Supabase (voir supabase_migration_documents.sql)
 */

'use strict';

const path = require('path');
const os   = require('os');

// Charger .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const Database         = require('better-sqlite3');

// ── Connexions ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Variables SUPABASE_URL et SUPABASE_KEY requises dans .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Chemin SQLite (même logique que l'app)
const appDataDir = process.env.APPDATA
  || path.join(os.homedir(), 'AppData', 'Roaming');
const DB_PATH = path.join(appDataDir, 'configurateur-v3', 'configurateur.db');

console.log('📂 SQLite :', DB_PATH);
console.log('☁️  Supabase :', SUPABASE_URL);
console.log('');

const db = new Database(DB_PATH, { readonly: true });

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseJson(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

async function upsertBatch(table, rows) {
  if (!rows.length) return 0;
  const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows.length;
}

// ── Migration Documents ──────────────────────────────────────────────────────

async function migrateDocuments() {
  console.log('📄 Migration des documents…');

  const rows = db.prepare('SELECT * FROM documents ORDER BY created_at ASC').all();
  console.log(`   ${rows.length} document(s) trouvé(s) dans SQLite`);

  if (!rows.length) return;

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

  const n = await upsertBatch('documents', mapped);
  console.log(`   ✅  ${n} document(s) migrés`);
}

// ── Migration document_counters ──────────────────────────────────────────────

async function migrateCounters() {
  console.log('🔢 Migration des compteurs de numérotation…');

  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM document_counters').all();
  } catch {
    console.log('   ℹ️  Pas de table document_counters dans SQLite (ignoré)');
    return;
  }

  if (!rows.length) { console.log('   ℹ️  Aucun compteur à migrer'); return; }

  const { error } = await sb.from('document_counters').upsert(
    rows.map(r => ({ type: r.type, year: r.year, last_number: r.last_number })),
    { onConflict: 'type,year' }
  );
  if (error) throw new Error(`document_counters: ${error.message}`);
  console.log(`   ✅  ${rows.length} compteur(s) migrés`);
}

// ── Migration Compositions ───────────────────────────────────────────────────

async function migrateCompositions() {
  console.log('🛋️  Migration des compositions…');

  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM compositions ORDER BY created_at ASC').all();
  } catch {
    console.log('   ℹ️  Pas de table compositions dans SQLite (ignoré)');
    return;
  }

  console.log(`   ${rows.length} composition(s) trouvée(s) dans SQLite`);
  if (!rows.length) return;

  // compositions utilise un SERIAL (auto-increment), pas d'upsert par id TEXT
  // On insère uniquement celles qui n'existent pas encore (par nom)
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
    console.log('   ℹ️  Toutes les compositions existent déjà dans Supabase');
    return;
  }

  const { error } = await sb.from('compositions').insert(toInsert);
  if (error) throw new Error(`compositions: ${error.message}`);
  console.log(`   ✅  ${toInsert.length} composition(s) migrée(s)`);
}

// ── Vérification tables Supabase ─────────────────────────────────────────────

async function checkSupabaseTables() {
  console.log('🔍 Vérification des tables Supabase…');
  const tables = ['documents', 'document_counters', 'compositions'];
  for (const t of tables) {
    const { error } = await sb.from(t).select('*').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.error(`   ❌  Table "${t}" inaccessible : ${error.message}`);
      console.error('      → Avez-vous exécuté supabase_migration_documents.sql dans Supabase ?');
      process.exit(1);
    }
    console.log(`   ✅  "${t}" accessible`);
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Migration SQLite → Supabase ===\n');

  await checkSupabaseTables();

  await migrateDocuments();
  await migrateCounters();
  await migrateCompositions();

  console.log('\n🎉 Migration terminée avec succès !');
  console.log('   Vous pouvez maintenant installer la nouvelle version de l\'app.');
  db.close();
}

main().catch(err => {
  console.error('\n❌ Erreur :', err.message);
  db.close();
  process.exit(1);
});
