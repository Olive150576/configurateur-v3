/**
 * StatsService — Statistiques ventes, produits, fournisseurs
 * Combine requêtes SQL et parsing des product_snapshot JSON.
 */

'use strict';

const { getDb } = require('../db/database');

// ==================== MAIN ====================

function getStats(period = 'all') {
  const db = getDb();

  // Filtre temporel
  const dateFilter = buildDateFilter(period);

  // ── Commandes validées ──────────────────────────────────────────────────
  const commandesRows = db.prepare(`
    SELECT id, total, ordered_at, product_snapshot
    FROM documents
    WHERE type = 'commande' AND status = 'ordered'
    ${dateFilter.sql}
    ORDER BY ordered_at ASC
  `).all(...dateFilter.params);

  // ── Compteurs documents ─────────────────────────────────────────────────
  const nbCommandes = commandesRows.length;

  const nbDevisTotal = db.prepare(`
    SELECT COUNT(*) as n FROM documents
    WHERE type IN ('devis','offre') AND status != 'draft'
    ${dateFilter.sql}
  `).get(...dateFilter.params).n;

  // ── Agrégats financiers ─────────────────────────────────────────────────
  const caTotal     = commandesRows.reduce((s, d) => s + (d.total || 0), 0);
  const panierMoyen = nbCommandes ? caTotal / nbCommandes : 0;
  const txTransformation = (nbDevisTotal + nbCommandes) > 0
    ? Math.round(nbCommandes / (nbDevisTotal + nbCommandes) * 100)
    : 0;

  // ── CA par mois (12 derniers mois, toujours toute la plage) ────────────
  const ventesParMois = db.prepare(`
    SELECT
      strftime('%Y-%m', ordered_at) as month,
      COUNT(*) as nb,
      ROUND(SUM(total), 2) as ca
    FROM documents
    WHERE type = 'commande' AND status = 'ordered'
      AND ordered_at >= datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  // ── Table des prix d'options (pour le CA par option) ───────────────────
  // productId|nomOption -> price
  const optionPriceMap = new Map();
  db.prepare('SELECT product_id, name, price FROM options').all()
    .forEach(o => optionPriceMap.set(`${o.product_id}|${o.name}`, o.price || 0));

  // Mots-clés mécanismes
  const RELAX_RE     = /relax/i;
  const MECHANISM_RE = /relax|releveur|relevable|électri|motoris|lift/i;

  // ── Parsing des snapshots ───────────────────────────────────────────────
  const prodMap      = new Map(); // name -> { count, ca }
  const supMap       = new Map(); // supplier_name -> { count, ca }
  const colorMap     = new Map(); // color_ref -> count
  const optionMap    = new Map(); // option name -> count
  const optionCAMap  = new Map(); // option name -> CA généré
  const moduleMap    = new Map(); // module name -> count

  let nbLignesTotal       = 0; // lignes produits (hors livraison)
  let nbLignesMechanism   = 0; // lignes avec au moins 1 mécanisme
  let nbCmdRelax          = 0; // commandes avec au moins 1 relax
  let nbCmdAvecOptions    = 0; // commandes avec au moins 1 option quelconque

  commandesRows.forEach(doc => {
    let snap;
    try { snap = JSON.parse(doc.product_snapshot || '{}'); } catch { snap = {}; }
    const lines = snap.lines || [];

    let docHasRelax   = false;
    let docHasOptions = false;

    lines.forEach(line => {
      if (line.is_delivery) return;

      const qty       = line.qty || 1;
      const lineCA    = (line.unit_price || 0) * qty;
      const productId = line.product_config?.product_id || '';
      const options   = line.product_config?.options || [];

      nbLignesTotal++;

      // Nom produit
      const productName = (line.designation || '').split('—')[0].trim();
      if (productName) accumMap(prodMap, productName, qty, lineCA);

      // Fournisseur
      const supplier = line.product_config?.supplier_name || '';
      if (supplier) accumMap(supMap, supplier, qty, lineCA);

      // Coloris
      if (line.color_ref?.trim()) {
        colorMap.set(line.color_ref.trim(),
          (colorMap.get(line.color_ref.trim()) || 0) + qty);
      }

      // Options — count + CA + mécanisme
      let lineHasMechanism = false;
      options.forEach(opt => {
        if (!opt.name) return;
        const optQty = (opt.qty || 1) * qty;

        // Count
        optionMap.set(opt.name, (optionMap.get(opt.name) || 0) + optQty);

        // CA généré par cette option (prix catalogue × quantité)
        const price = optionPriceMap.get(`${productId}|${opt.name}`) || 0;
        if (price > 0) {
          optionCAMap.set(opt.name, (optionCAMap.get(opt.name) || 0) + price * optQty);
        }

        // Mécanisme ?
        if (MECHANISM_RE.test(opt.name)) lineHasMechanism = true;
        if (RELAX_RE.test(opt.name))     docHasRelax = true;
        docHasOptions = true;
      });

      if (lineHasMechanism) nbLignesMechanism++;

      // Modules
      (line.product_config?.modules || []).forEach(mod => {
        if (mod.name) moduleMap.set(mod.name,
          (moduleMap.get(mod.name) || 0) + (mod.qty || 1) * qty);
      });
    });

    if (docHasRelax)   nbCmdRelax++;
    if (docHasOptions) nbCmdAvecOptions++;
  });

  // Pourcentages finitions
  const pctRelax      = nbCommandes ? Math.round(nbCmdRelax      / nbCommandes * 100) : 0;
  const pctAvecOpt    = nbCommandes ? Math.round(nbCmdAvecOptions / nbCommandes * 100) : 0;
  const pctMechanism  = nbLignesTotal ? Math.round(nbLignesMechanism / nbLignesTotal * 100) : 0;
  const pctFixe       = 100 - pctMechanism;

  // Top 5 options par CA généré
  const topOptionsCA = [...optionCAMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, ca]) => ({ name, ca: Math.round(ca) }));

  return {
    // Ventes
    caTotal:          Math.round(caTotal),
    panierMoyen:      Math.round(panierMoyen),
    nbCommandes,
    nbDevisTotal,
    txTransformation,
    ventesParMois:    fillMonths(ventesParMois),

    // Produits
    topProduits:      sortByCount(prodMap, 12),

    // Fournisseurs
    topFournisseurs:  sortByCount(supMap, 10),

    // Finitions
    topColoris:       sortByCountSimple(colorMap, 12),
    topOptions:       sortByCountSimple(optionMap, 15),
    topOptionsCA,
    topModules:       sortByCountSimple(moduleMap, 10),
    pctRelax,
    pctAvecOpt,
    pctMechanism,
    pctFixe,
    nbCmdRelax,
    nbCmdAvecOptions,
    nbLignesMechanism,
    nbLignesTotal,
  };
}

// ==================== HELPERS ====================

function buildDateFilter(period) {
  const now = new Date();
  if (period === 'year') {
    const year = now.getFullYear();
    return {
      sql: `AND ordered_at >= '${year}-01-01' AND ordered_at < '${year + 1}-01-01'`,
      params: [],
    };
  }
  if (period === 'month') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return {
      sql: `AND ordered_at >= '${y}-${m}-01'`,
      params: [],
    };
  }
  return { sql: '', params: [] };
}

function accumMap(map, key, count, ca) {
  const existing = map.get(key) || { count: 0, ca: 0 };
  map.set(key, { count: existing.count + count, ca: existing.ca + ca });
}

function sortByCount(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].ca - a[1].ca)
    .slice(0, n)
    .map(([name, v]) => ({ name, count: v.count, ca: Math.round(v.ca) }));
}

function sortByCountSimple(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Complète les mois manquants dans les 12 derniers mois
 */
function fillMonths(rows) {
  const map = new Map(rows.map(r => [r.month, r]));
  const result = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    result.push(map.get(key) ?? { month: key, label, nb: 0, ca: 0 });
  }
  // Ajouter les labels courts
  return result.map(r => ({
    ...r,
    label: new Date(r.month + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
  }));
}

// ==================== STATS AVANCÉES ====================

/**
 * Données indépendantes de la période :
 *  - Heatmap saisonnalité (toutes années)
 *  - Produits inactifs depuis 6 mois
 *  - Top combinaisons de produits
 */
function getAdvancedStats() {
  const db = getDb();

  // ── 1. Heatmap saisonnalité ─────────────────────────────────────────────
  const rawSeasonality = db.prepare(`
    SELECT
      CAST(strftime('%Y', ordered_at) AS INTEGER) as year,
      CAST(strftime('%m', ordered_at) AS INTEGER) as month,
      COUNT(*) as nb,
      ROUND(SUM(total), 0) as ca
    FROM documents
    WHERE type = 'commande' AND status = 'ordered'
      AND ordered_at IS NOT NULL
    GROUP BY year, month
    ORDER BY year, month
  `).all();

  const years = [...new Set(rawSeasonality.map(r => r.year))].sort();
  const heatCells = {};
  rawSeasonality.forEach(r => { heatCells[`${r.year}-${r.month}`] = { nb: r.nb, ca: r.ca }; });
  const heatMaxCA = Math.max(...rawSeasonality.map(r => r.ca), 1);

  // ── 2. Produits inactifs (catalogue actif, pas commandé depuis 6 mois) ──
  const allProducts = db.prepare(`
    SELECT p.id, p.name, p.collection, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.active = 1 AND p.archived = 0
    ORDER BY s.name, p.name
  `).all();

  const allCommandes = db.prepare(`
    SELECT product_snapshot, ordered_at
    FROM documents
    WHERE type = 'commande' AND status = 'ordered'
    ORDER BY ordered_at ASC
  `).all();

  // product_id -> dernière date commandée
  const lastOrderMap = new Map();
  allCommandes.forEach(doc => {
    let snap;
    try { snap = JSON.parse(doc.product_snapshot || '{}'); } catch { snap = {}; }
    (snap.lines || []).forEach(line => {
      if (line.is_delivery) return;
      const pid = line.product_config?.product_id;
      if (pid && (!lastOrderMap.has(pid) || doc.ordered_at > lastOrderMap.get(pid))) {
        lastOrderMap.set(pid, doc.ordered_at);
      }
    });
  });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const inactifProducts = allProducts
    .map(p => ({ ...p, lastOrderedAt: lastOrderMap.get(p.id) || null }))
    .filter(p => !p.lastOrderedAt || new Date(p.lastOrderedAt) < sixMonthsAgo)
    .sort((a, b) => {
      if (!a.lastOrderedAt && !b.lastOrderedAt) return 0;
      if (!a.lastOrderedAt) return -1;
      if (!b.lastOrderedAt) return 1;
      return new Date(a.lastOrderedAt) - new Date(b.lastOrderedAt);
    });

  // ── 3. Top combinaisons (paires de produits dans la même commande) ──────
  const pairMap = new Map();
  allCommandes.forEach(doc => {
    let snap;
    try { snap = JSON.parse(doc.product_snapshot || '{}'); } catch { snap = {}; }
    const lines = (snap.lines || []).filter(l => !l.is_delivery && l.designation);

    // Noms uniques dans cette commande (sans la partie gamme)
    const names = [...new Set(
      lines.map(l => (l.designation || '').split('—')[0].trim()).filter(Boolean)
    )];

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = [names[i], names[j]].sort().join(' ＋ ');
        pairMap.set(key, (pairMap.get(key) || 0) + 1);
      }
    }
  });

  const topCombinations = [...pairMap.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([pair, count]) => ({ pair, count }));

  return {
    seasonality: { years, cells: heatCells, maxCA: heatMaxCA },
    inactifProducts,
    topCombinations,
  };
}

module.exports = { getStats, getAdvancedStats };
