/**
 * Numbering — Numérotation séquentielle des documents
 * Un numéro est attribué une seule fois, à la validation.
 * Jamais réutilisé, même si le document est annulé.
 */

const { getDb } = require('../db/database');

const PREFIXES = {
  devis:    'DEV',
  offre:    'OFF',
  commande: 'CMD',
};

/**
 * Génère et réserve le prochain numéro pour un type de document.
 * Opération atomique via transaction SQLite.
 *
 * @param {string} type - 'devis' | 'offre' | 'commande'
 * @returns {string} ex: "DEV-2026-0001"
 */
function generateNumber(type) {
  const db = getDb();
  const prefix = PREFIXES[type];

  if (!prefix) throw new Error(`Type de document inconnu: ${type}`);

  const year = new Date().getFullYear();

  const generate = db.transaction(() => {
    // UPSERT atomique : incrémente ou crée le compteur
    db.prepare(`
      INSERT INTO document_counters (type, year, last_number)
      VALUES (?, ?, 1)
      ON CONFLICT(type, year) DO UPDATE SET last_number = last_number + 1
    `).run(type, year);

    const row = db.prepare(
      'SELECT last_number FROM document_counters WHERE type = ? AND year = ?'
    ).get(type, year);

    return row.last_number;
  });

  const number = generate();
  return `${prefix}-${year}-${String(number).padStart(4, '0')}`;
}

/**
 * Retourne le dernier numéro attribué pour un type (sans incrémenter)
 */
function getLastNumber(type) {
  const db = getDb();
  const year = new Date().getFullYear();

  const row = db.prepare(
    'SELECT last_number FROM document_counters WHERE type = ? AND year = ?'
  ).get(type, year);

  return row ? row.last_number : 0;
}

module.exports = { generateNumber, getLastNumber };
