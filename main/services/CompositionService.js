'use strict';

const { getDb } = require('../db/database');

function getAll() {
  const db = getDb();
  return db.prepare(
    'SELECT id, name, product_id, modules_json, thumbnail_svg, created_at, updated_at FROM compositions ORDER BY updated_at DESC'
  ).all();
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM compositions WHERE id = ?').get(id) || null;
}

function save(data) {
  const db = getDb();
  if (!data.name || !String(data.name).trim()) throw new Error('Le nom de la composition est requis');

  const name         = String(data.name).trim();
  const product_id   = data.product_id   || null;
  const modules_json = data.modules_json || '[]';
  const thumbnail    = data.thumbnail_svg || null;

  if (data.id) {
    db.prepare(`
      UPDATE compositions
      SET name = ?, product_id = ?, modules_json = ?, thumbnail_svg = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, product_id, modules_json, thumbnail, data.id);
    return getById(data.id);
  } else {
    const result = db.prepare(`
      INSERT INTO compositions (name, product_id, modules_json, thumbnail_svg)
      VALUES (?, ?, ?, ?)
    `).run(name, product_id, modules_json, thumbnail);
    return getById(result.lastInsertRowid);
  }
}

function remove(id) {
  const db = getDb();
  const r = db.prepare('DELETE FROM compositions WHERE id = ?').run(id);
  if (r.changes === 0) throw new Error(`Composition ${id} introuvable`);
  return true;
}

module.exports = { getAll, getById, save, remove };
