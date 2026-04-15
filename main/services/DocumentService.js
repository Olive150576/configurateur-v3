/**
 * DocumentService — Cycle de vie complet des documents
 */

const { getDb } = require('../db/database');
const { validateDocument, validateTransition, ValidationError } = require('../utils/validator');
const { generateNumber } = require('../utils/numbering');
const { log } = require('../utils/logger');

function generateId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Récupère tous les documents avec filtres optionnels
 */
function getAll(filters = {}) {
  const db = getDb();

  let query = `
    SELECT d.*,
      json_extract(d.client_snapshot, '$.name') as client_name
    FROM documents d
    WHERE 1=1
  `;
  const params = [];

  if (filters.type) { query += ' AND d.type = ?'; params.push(filters.type); }
  if (filters.status) { query += ' AND d.status = ?'; params.push(filters.status); }
  if (filters.client_id) { query += ' AND d.client_id = ?'; params.push(filters.client_id); }
  if (filters.search) {
    query += ' AND (c.name LIKE ? OR d.number LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += ' ORDER BY d.created_at DESC';
  if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }

  return db.prepare(query).all(...params);
}

/**
 * Récupère un document par ID
 */
function getById(id) {
  const db = getDb();
  const doc = db.prepare(`
    SELECT d.*,
      json_extract(d.client_snapshot, '$.name') as client_name
    FROM documents d
    WHERE d.id = ?
  `).get(id);

  if (!doc) return null;

  // Parser les snapshots JSON
  return {
    ...doc,
    client_snapshot: JSON.parse(doc.client_snapshot || '{}'),
    product_snapshot: JSON.parse(doc.product_snapshot || '{}'),
  };
}

/**
 * Crée un brouillon (sans numéro)
 */
function create(data) {
  validateDocument(data);

  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO documents (
      id, type, status, client_id,
      client_snapshot, product_snapshot,
      subtotal, discount_percent, discount_amount,
      total, deposit_percent, deposit_amount, balance,
      notes, parent_id,
      composition_svg, composition_json
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.type, data.client_id || null,
    JSON.stringify(data.client_snapshot || {}),
    JSON.stringify(data.product_snapshot || {}),
    data.subtotal, data.discount_percent, data.discount_amount,
    data.total, data.deposit_percent, data.deposit_amount, data.balance,
    data.notes || '',
    data.parent_id || null,
    data.composition_svg  || null,
    data.composition_json || null
  );

  log('document', id, 'created', { type: data.type });
  return getById(id);
}

/**
 * Met à jour un brouillon (impossible si validé)
 */
function update(id, data) {
  const existing = getById(id);
  if (!existing) throw new ValidationError(`Document ${id} non trouvé`);
  if (existing.status !== 'draft') {
    throw new ValidationError('Seul un brouillon peut être modifié');
  }

  validateDocument({ ...existing, ...data });

  const db = getDb();
  db.prepare(`
    UPDATE documents SET
      type = ?, client_id = ?, client_snapshot = ?, product_snapshot = ?,
      subtotal = ?, discount_percent = ?, discount_amount = ?,
      total = ?, deposit_percent = ?, deposit_amount = ?, balance = ?,
      notes = ?,
      composition_svg  = ?,
      composition_json = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.type ?? existing.type,
    data.client_id ?? existing.client_id,
    JSON.stringify(data.client_snapshot ?? existing.client_snapshot),
    JSON.stringify(data.product_snapshot ?? existing.product_snapshot),
    data.subtotal ?? existing.subtotal,
    data.discount_percent ?? existing.discount_percent,
    data.discount_amount ?? existing.discount_amount,
    data.total ?? existing.total,
    data.deposit_percent ?? existing.deposit_percent,
    data.deposit_amount ?? existing.deposit_amount,
    data.balance ?? existing.balance,
    data.notes ?? existing.notes,
    'composition_svg'  in data ? (data.composition_svg  || null) : existing.composition_svg,
    'composition_json' in data ? (data.composition_json || null) : existing.composition_json,
    id
  );

  log('document', id, 'updated');
  return getById(id);
}

/**
 * Valide un brouillon → attribue un numéro définitif
 */
function validate(id) {
  const doc = getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);

  validateTransition(doc.status, 'validated');

  const db = getDb();
  const number = generateNumber(doc.type);

  db.prepare(`
    UPDATE documents SET
      status = 'validated', number = ?, validated_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(number, id);

  log('document', id, 'validated', { number });
  return getById(id);
}

/**
 * Transition de statut (envoyé, archivé, annulé...)
 */
function transition(id, toStatus) {
  const doc = getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);

  validateTransition(doc.status, toStatus);

  const db = getDb();
  const extra = toStatus === 'ordered' ? `, ordered_at = datetime('now')` : '';

  db.prepare(`
    UPDATE documents SET status = ?, updated_at = datetime('now')${extra} WHERE id = ?
  `).run(toStatus, id);

  log('document', id, `status_${toStatus}`);
  return getById(id);
}

/**
 * Transforme un devis en commande (ou offre en commande)
 * Le document source passe en statut 'ordered'
 */
function transform(id, targetType) {
  const source = getById(id);
  if (!source) throw new ValidationError(`Document ${id} non trouvé`);

  if (!['validated', 'sent'].includes(source.status)) {
    throw new ValidationError('Seul un document validé ou envoyé peut être transformé');
  }
  if (targetType !== 'commande') {
    throw new ValidationError('La transformation crée toujours une commande');
  }

  const db = getDb();
  const newId = generateId();

  // Créer la commande avec les mêmes données figées (snapshot immuable)
  const newDoc = {
    type: 'commande',
    client_id: source.client_id,
    client_snapshot: source.client_snapshot,
    product_snapshot: source.product_snapshot,
    subtotal: source.subtotal,
    discount_percent: source.discount_percent,
    discount_amount: source.discount_amount,
    total: source.total,
    deposit_percent: source.deposit_percent,
    deposit_amount: source.deposit_amount,
    balance: source.balance,
    notes: source.notes,
    parent_id: source.id,
  };

  validateDocument(newDoc);

  const newNumber = generateNumber('commande');

  db.prepare(`
    INSERT INTO documents (
      id, number, type, status, client_id,
      client_snapshot, product_snapshot,
      subtotal, discount_percent, discount_amount,
      total, deposit_percent, deposit_amount, balance,
      notes, parent_id, validated_at, ordered_at
    ) VALUES (?, ?, 'commande', 'ordered', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    newId, newNumber, newDoc.client_id,
    JSON.stringify(newDoc.client_snapshot),
    JSON.stringify(newDoc.product_snapshot),
    newDoc.subtotal, newDoc.discount_percent, newDoc.discount_amount,
    newDoc.total, newDoc.deposit_percent, newDoc.deposit_amount, newDoc.balance,
    newDoc.notes, source.id
  );

  // Marquer le document source comme commandé
  db.prepare(`
    UPDATE documents SET status = 'ordered', ordered_at = datetime('now'),
    updated_at = datetime('now') WHERE id = ?
  `).run(id);

  log('document', newId, 'created_from_transform', { source_id: id, number: newNumber });
  log('document', id, 'transformed', { into: newId });

  return getById(newId);
}

/**
 * Duplique un document → nouveau brouillon (sans numéro)
 */
function duplicate(id) {
  const source = getById(id);
  if (!source) throw new ValidationError(`Document ${id} non trouvé`);

  const newDoc = {
    type: source.type,
    client_id: source.client_id,
    client_snapshot: source.client_snapshot,
    product_snapshot: source.product_snapshot,
    subtotal: source.subtotal,
    discount_percent: source.discount_percent,
    discount_amount: source.discount_amount,
    total: source.total,
    deposit_percent: source.deposit_percent,
    deposit_amount: source.deposit_amount,
    balance: source.balance,
    notes: source.notes,
    parent_id: null,
  };

  const created = create(newDoc);
  log('document', created.id, 'duplicated_from', { source_id: id });
  return created;
}

/**
 * Supprime définitivement un document
 */
function remove(id) {
  const doc = getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);
  const db = getDb();
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  log('document', id, 'deleted', { number: doc.number, type: doc.type });
  return true;
}

module.exports = { getAll, getById, create, update, validate, transition, transform, duplicate, remove };
