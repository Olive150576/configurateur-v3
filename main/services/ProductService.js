/**
 * ProductService — CRUD produits avec validation
 */

const { getDb } = require('../db/database');
const { validateProduct, ValidationError } = require('../utils/validator');
const { log } = require('../utils/logger');

function generateId(prefix = 'prod') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Récupère tous les produits actifs avec leurs gammes, modules et options
 */
function getAll(includeArchived = false) {
  const db = getDb();

  const products = db.prepare(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.archived = ?
    ORDER BY p.name
  `).all(includeArchived ? 1 : 0);

  return products.map(p => enrichProduct(p));
}

/**
 * Récupère un produit par ID avec toutes ses données
 */
function getById(id) {
  const db = getDb();

  const product = db.prepare(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ?
  `).get(id);

  if (!product) return null;
  return enrichProduct(product);
}

/**
 * Enrichit un produit avec ses gammes, modules et options
 */
function enrichProduct(product) {
  const db = getDb();

  const ranges = db.prepare(
    'SELECT * FROM ranges WHERE product_id = ? ORDER BY sort_order, name'
  ).all(product.id);

  const modules = db.prepare(
    'SELECT * FROM modules WHERE product_id = ? ORDER BY sort_order, name'
  ).all(product.id);

  // Charger les prix par gamme pour chaque module
  const modulesWithPrices = modules.map(module => {
    const prices = db.prepare(
      'SELECT range_id, price FROM module_prices WHERE module_id = ?'
    ).all(module.id);

    return {
      ...module,
      prices: Object.fromEntries(prices.map(p => [p.range_id, p.price]))
    };
  });

  const options = db.prepare(
    'SELECT * FROM options WHERE product_id = ? ORDER BY sort_order, name'
  ).all(product.id);

  return { ...product, ranges, modules: modulesWithPrices, options };
}

/**
 * Crée un nouveau produit
 */
function create(data) {
  validateProduct(data);

  const db = getDb();
  const id = data.id || generateId('prod');

  const insert = db.transaction(() => {
    // Produit principal
    db.prepare(`
      INSERT INTO products (id, name, supplier_id, collection, description, active, valid_from, valid_until, purchase_coefficient, price_rounding, photo, supplier_notes)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name.trim(),
      data.supplier_id || null,
      data.collection?.trim() || '',
      data.description?.trim() || '',
      data.valid_from || null,
      data.valid_until || null,
      data.purchase_coefficient ?? 2.0,
      data.price_rounding ?? 'none',
      data.photo || '',
      data.supplier_notes?.trim() || ''
    );

    // Gammes
    for (let i = 0; i < data.ranges.length; i++) {
      const r = data.ranges[i];
      db.prepare(`
        INSERT INTO ranges (id, product_id, name, base_price, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(r.id || generateId('range'), id, r.name.trim(), r.base_price, i);
    }

    // Modules
    for (let i = 0; i < data.modules.length; i++) {
      const m = data.modules[i];
      const moduleId = m.id || generateId('mod');
      db.prepare(`
        INSERT INTO modules (id, product_id, name, description, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(moduleId, id, m.name.trim(), m.description?.trim() || '', i);

      // Prix par gamme
      for (const [rangeId, price] of Object.entries(m.prices || {})) {
        db.prepare(`
          INSERT INTO module_prices (module_id, range_id, price) VALUES (?, ?, ?)
        `).run(moduleId, rangeId, price);
      }
    }

    // Options
    for (let i = 0; i < (data.options || []).length; i++) {
      const o = data.options[i];
      db.prepare(`
        INSERT INTO options (id, product_id, name, description, price, type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        o.id || generateId('opt'), id,
        o.name.trim(), o.description?.trim() || '',
        o.price, o.type || '', i
      );
    }
  });

  insert();
  log('product', id, 'created', { name: data.name });

  return getById(id);
}

/**
 * Met à jour un produit (remplace gammes/modules/options)
 */
function update(id, data) {
  const existing = getById(id);
  if (!existing) throw new ValidationError(`Produit ${id} non trouvé`);

  validateProduct({ ...existing, ...data });

  const db = getDb();

  const doUpdate = db.transaction(() => {
    db.prepare(`
      UPDATE products SET
        name = ?, supplier_id = ?, collection = ?, description = ?,
        valid_from = ?, valid_until = ?, purchase_coefficient = ?, price_rounding = ?,
        photo = ?, supplier_notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.name?.trim() ?? existing.name,
      data.supplier_id ?? existing.supplier_id,
      data.collection?.trim() ?? existing.collection,
      data.description?.trim() ?? existing.description,
      data.valid_from ?? existing.valid_from,
      data.valid_until ?? existing.valid_until,
      data.purchase_coefficient ?? existing.purchase_coefficient ?? 2.0,
      data.price_rounding ?? existing.price_rounding ?? 'none',
      data.photo ?? existing.photo ?? '',
      data.supplier_notes?.trim() ?? existing.supplier_notes ?? '',
      id
    );

    if (data.ranges) {
      db.prepare('DELETE FROM ranges WHERE product_id = ?').run(id);
      for (let i = 0; i < data.ranges.length; i++) {
        const r = data.ranges[i];
        db.prepare(`
          INSERT INTO ranges (id, product_id, name, base_price, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `).run(r.id || generateId('range'), id, r.name.trim(), r.base_price, i);
      }
    }

    if (data.modules) {
      db.prepare('DELETE FROM modules WHERE product_id = ?').run(id);
      for (let i = 0; i < data.modules.length; i++) {
        const m = data.modules[i];
        const moduleId = m.id || generateId('mod');
        db.prepare(`
          INSERT INTO modules (id, product_id, name, description, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `).run(moduleId, id, m.name.trim(), m.description?.trim() || '', i);

        for (const [rangeId, price] of Object.entries(m.prices || {})) {
          db.prepare(`
            INSERT INTO module_prices (module_id, range_id, price) VALUES (?, ?, ?)
          `).run(moduleId, rangeId, price);
        }
      }
    }

    if (data.options !== undefined) {
      db.prepare('DELETE FROM options WHERE product_id = ?').run(id);
      for (let i = 0; i < data.options.length; i++) {
        const o = data.options[i];
        db.prepare(`
          INSERT INTO options (id, product_id, name, description, price, type, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          o.id || generateId('opt'), id,
          o.name.trim(), o.description?.trim() || '',
          o.price, o.type || '', i
        );
      }
    }
  });

  doUpdate();
  log('product', id, 'updated');

  return getById(id);
}

/**
 * Archive un produit (soft delete — l'historique reste cohérent)
 */
function archive(id) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) throw new ValidationError(`Produit ${id} non trouvé`);

  db.prepare(`
    UPDATE products SET archived = 1, updated_at = datetime('now') WHERE id = ?
  `).run(id);

  log('product', id, 'archived');
}

/**
 * Restaure un produit archivé
 */
function restore(id) {
  const db = getDb();
  db.prepare(`
    UPDATE products SET archived = 0, updated_at = datetime('now') WHERE id = ?
  `).run(id);
  log('product', id, 'restored');
}

/**
 * Active ou désactive un produit (visible dans le configurateur)
 */
function setActive(id, active) {
  const db = getDb();
  db.prepare(`
    UPDATE products SET active = ?, updated_at = datetime('now') WHERE id = ?
  `).run(active ? 1 : 0, id);
  log('product', id, active ? 'activated' : 'deactivated');
}

/**
 * Duplique un produit
 */
function duplicate(id) {
  const original = getById(id);
  if (!original) throw new ValidationError(`Produit ${id} non trouvé`);

  // Construire le mapping ancien ID → nouvel ID pour les gammes
  const rangeIdMap = {};
  const newRanges = original.ranges.map(r => {
    const newRangeId = generateId('range');
    rangeIdMap[r.id] = newRangeId;
    return { ...r, id: newRangeId };
  });

  const newId = generateId('prod');
  const newData = {
    ...original,
    id: newId,
    name: `${original.name} (copie)`,
    ranges: newRanges,
    modules: original.modules.map(m => ({
      ...m,
      id: generateId('mod'),
      // Remappe les prix avec les nouveaux IDs de gammes
      prices: Object.fromEntries(
        Object.entries(m.prices || {}).map(([rId, price]) => [rangeIdMap[rId] ?? rId, price])
      ),
    })),
    options: original.options.map(o => ({ ...o, id: generateId('opt') })),
  };

  return create(newData);
}

/**
 * Recherche produits (nom, collection, fournisseur)
 */
function search(term) {
  const db = getDb();
  const like = `%${term}%`;

  const products = db.prepare(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.archived = 0
      AND (p.name LIKE ? OR p.collection LIKE ? OR s.name LIKE ?)
    ORDER BY p.name
  `).all(like, like, like);

  return products.map(p => enrichProduct(p));
}

module.exports = { getAll, getById, create, update, archive, restore, setActive, duplicate, search };
