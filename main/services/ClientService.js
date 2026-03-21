/**
 * ClientService — CRUD clients
 */

const { getDb } = require('../db/database');
const { validateClient, ValidationError } = require('../utils/validator');
const { log } = require('../utils/logger');

function generateId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function getAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM clients ORDER BY name').all();
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

function create(data) {
  validateClient(data);
  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO clients (id, name, email, phone, company, address, city, zip, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.name.trim(),
    data.email?.trim() || '',
    data.phone?.trim() || '',
    data.company?.trim() || '',
    data.address?.trim() || '',
    data.city?.trim() || '',
    data.zip?.trim() || '',
    data.notes?.trim() || ''
  );

  log('client', id, 'created', { name: data.name });
  return getById(id);
}

function update(id, data) {
  const existing = getById(id);
  if (!existing) throw new ValidationError(`Client ${id} non trouvé`);

  validateClient({ ...existing, ...data });
  const db = getDb();

  db.prepare(`
    UPDATE clients SET
      name = ?, email = ?, phone = ?, company = ?,
      address = ?, city = ?, zip = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name?.trim() ?? existing.name,
    data.email?.trim() ?? existing.email,
    data.phone?.trim() ?? existing.phone,
    data.company?.trim() ?? existing.company,
    data.address?.trim() ?? existing.address,
    data.city?.trim() ?? existing.city,
    data.zip?.trim() ?? existing.zip,
    data.notes?.trim() ?? existing.notes,
    id
  );

  log('client', id, 'updated');
  return getById(id);
}

function search(term) {
  const db = getDb();
  const like = `%${term}%`;
  return db.prepare(`
    SELECT * FROM clients
    WHERE name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?
    ORDER BY name
  `).all(like, like, like, like);
}

/**
 * Exporte tous les clients au format CSV (retourne la chaîne CSV)
 */
function exportCSV() {
  const clients = getAll();
  const headers = ['name','company','email','phone','address','city','zip','notes'];
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows    = clients.map(c => headers.map(h => escape(c[h])).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Importe des clients depuis un tableau de lignes CSV parsées
 * @param {Array<Object>} rows - tableau d'objets avec les champs clients
 */
function importCSV(rows) {
  let imported = 0;
  const errors = [];
  for (const row of rows) {
    try {
      create(row);
      imported++;
    } catch (e) {
      errors.push(`${row.name ?? '?'}: ${e.message}`);
    }
  }
  return { imported, errors };
}

module.exports = { getAll, getById, create, update, search, exportCSV, importCSV };
