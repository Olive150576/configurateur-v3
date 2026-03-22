/**
 * SupplierService — Gestion des fournisseurs
 */

const { getDb } = require('../db/database');
const { log } = require('../utils/logger');

function generateId() {
  return `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

const FIELDS = [
  'name', 'address', 'city', 'zip', 'phone', 'email',
  'contact', 'contact_phone', 'contact_email',
  'commercial_name', 'commercial_phone', 'commercial_email',
  'sav_name', 'sav_phone', 'sav_email',
];

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
  db.prepare(`
    INSERT INTO suppliers (
      id, name, address, city, zip, phone, email,
      contact, contact_phone, contact_email,
      commercial_name, commercial_phone, commercial_email,
      sav_name, sav_phone, sav_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name?.trim()             || '',
    data.address?.trim()          || '',
    data.city?.trim()             || '',
    data.zip?.trim()              || '',
    data.phone?.trim()            || '',
    data.email?.trim()            || '',
    data.contact?.trim()          || '',
    data.contact_phone?.trim()    || '',
    data.contact_email?.trim()    || '',
    data.commercial_name?.trim()  || '',
    data.commercial_phone?.trim() || '',
    data.commercial_email?.trim() || '',
    data.sav_name?.trim()         || '',
    data.sav_phone?.trim()        || '',
    data.sav_email?.trim()        || '',
  );
  log('supplier', id, 'created', { name: data.name });
  return getById(id);
}

function update(id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE suppliers SET
      name = ?, address = ?, city = ?, zip = ?,
      phone = ?, email = ?,
      contact = ?, contact_phone = ?, contact_email = ?,
      commercial_name = ?, commercial_phone = ?, commercial_email = ?,
      sav_name = ?, sav_phone = ?, sav_email = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name?.trim()             || '',
    data.address?.trim()          || '',
    data.city?.trim()             || '',
    data.zip?.trim()              || '',
    data.phone?.trim()            || '',
    data.email?.trim()            || '',
    data.contact?.trim()          || '',
    data.contact_phone?.trim()    || '',
    data.contact_email?.trim()    || '',
    data.commercial_name?.trim()  || '',
    data.commercial_phone?.trim() || '',
    data.commercial_email?.trim() || '',
    data.sav_name?.trim()         || '',
    data.sav_phone?.trim()        || '',
    data.sav_email?.trim()        || '',
    id,
  );
  log('supplier', id, 'updated');
  return getById(id);
}

function search(term) {
  const db = getDb();
  const like = `%${term}%`;
  return db.prepare(`
    SELECT * FROM suppliers
    WHERE active = 1
      AND (name LIKE ? OR contact LIKE ? OR commercial_name LIKE ? OR email LIKE ? OR phone LIKE ?)
    ORDER BY name
  `).all(like, like, like, like, like);
}

function archive(id) {
  const db = getDb();
  db.prepare(`UPDATE suppliers SET active=0, updated_at=datetime('now') WHERE id=?`).run(id);
  log('supplier', id, 'archived');
}

module.exports = { getAll, getById, findByName, findOrCreate, create, update, search, archive };
