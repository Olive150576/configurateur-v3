/**
 * Logger — Logs locaux des actions critiques
 */

const { getDb } = require('../db/database');

function log(entityType, entityId, action, detail = {}) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO action_logs (entity_type, entity_id, action, detail)
      VALUES (?, ?, ?, ?)
    `).run(entityType, entityId, action, JSON.stringify(detail));
  } catch (e) {
    console.error('Logger error:', e.message);
  }
}

module.exports = { log };
