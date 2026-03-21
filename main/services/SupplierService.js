/**
 * SupplierService — Gestion des fournisseurs
 */

const { getDb } = require('../db/database');
const { log } = require('../utils/logger');

function generateId() {
  return `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function getAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM suppliers WHERE active = 1 ORDER BY name').all();
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

function findByName(name) {
  const db = getDb();
  return db.prepare('SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE').get(name);
}

/**
 * Trouve ou crée un fournisseur par nom.
 * Utilisé par ProductService pour simplifier la saisie.
 */
function findOrCreate(name) {
  if (!name?.trim()) return null;
  const existing = findByName(name.trim());
  if (existing) return existing;

  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO suppliers (id, name) VALUES (?, ?)').run(id, name.trim());
  log('supplier', id, 'created', { name });
  return getById(id);
}

function create(data) {
  if (!data.name?.trim()) throw new Error('Nom fournisseur obligatoire');
  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO suppliers (id, name, contact, email, phone) VALUES (?, ?, ?, ?, ?)')
    .run(id, data.name.trim(), data.contact || '', data.email || '', data.phone || '');
  log('supplier', id, 'created', { name: data.name });
  return getById(id);
}

function update(id, data) {
  const db = getDb();
  db.prepare(`UPDATE suppliers SET name=?, contact=?, email=?, phone=?, updated_at=datetime('now') WHERE id=?`)
    .run(data.name?.trim(), data.contact || '', data.email || '', data.phone || '', id);
  return getById(id);
}

function archive(id) {
  const db = getDb();
  db.prepare(`UPDATE suppliers SET active=0, updated_at=datetime('now') WHERE id=?`).run(id);
  log('supplier', id, 'archived');
}

module.exports = { getAll, getById, findByName, findOrCreate, create, update, archive };
