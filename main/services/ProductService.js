/**
 * ProductService — CRUD produits via Supabase
 */

const { getSupabase } = require('../db/supabase');
const { validateProduct, ValidationError } = require('../utils/validator');
const { log } = require('../utils/logger');

function generateId(prefix = 'prod') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function sbErr(error) {
  throw new Error(error.message);
}

/**
 * Transforme un produit retourné par Supabase (relations imbriquées)
 * vers le format attendu par le renderer.
 */
function normalizeProduct(p) {
  const { suppliers, ranges, modules, options, ...product } = p;

  return {
    ...product,
    supplier_name: suppliers?.name || null,
    ranges: (ranges || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    modules: (modules || [])
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map(m => {
        const { module_prices, ...module } = m;
        return {
          ...module,
          prices: Object.fromEntries((module_prices || []).map(mp => [mp.range_id, mp.price])),
        };
      }),
    options: (options || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  };
}

const PRODUCT_SELECT = `
  *,
  suppliers(name),
  ranges(*),
  modules(*, module_prices(*)),
  options(*)
`;

/**
 * Récupère tous les produits actifs (ou archivés)
 */
async function getAll(includeArchived = false) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('archived', includeArchived ? 1 : 0)
    .order('name');

  if (error) sbErr(error);
  return data.map(normalizeProduct);
}

/**
 * Récupère un produit par ID
 */
async function getById(id) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    sbErr(error);
  }
  return normalizeProduct(data);
}

/**
 * Crée un nouveau produit
 */
async function create(data) {
  validateProduct(data);

  const sb = getSupabase();
  const id = data.id || generateId('prod');

  // 1. Produit
  const { error: pErr } = await sb.from('products').insert({
    id,
    name:                 data.name.trim(),
    supplier_id:          data.supplier_id || null,
    collection:           data.collection?.trim() || '',
    description:          data.description?.trim() || '',
    active:               1,
    valid_from:           data.valid_from || null,
    valid_until:          data.valid_until || null,
    purchase_coefficient: data.purchase_coefficient ?? 2.0,
    price_rounding:       data.price_rounding ?? 'none',
    photo:                data.photo || '',
    supplier_notes:       data.supplier_notes?.trim() || '',
  });
  if (pErr) sbErr(pErr);

  try {
    // 2. Gammes — toujours générer de nouveaux IDs
    const rangeIdMap = {};
    for (let i = 0; i < (data.ranges || []).length; i++) {
      const r = data.ranges[i];
      const newRangeId = generateId('range');
      rangeIdMap[r.id] = newRangeId;
      const { error: rErr } = await sb.from('ranges').insert({
        id: newRangeId, product_id: id,
        name: r.name.trim(), base_price: r.base_price,
        dimensions: r.dimensions?.trim() || '', sort_order: i,
      });
      if (rErr) throw new Error(rErr.message);
    }

    // 3. Modules + prix
    for (let i = 0; i < (data.modules || []).length; i++) {
      const m = data.modules[i];
      const moduleId = generateId('mod');
      const { error: mErr } = await sb.from('modules').insert({
        id: moduleId, product_id: id,
        name: m.name.trim(), description: m.description?.trim() || '',
        dimensions: m.dimensions?.trim() || '', sort_order: i,
      });
      if (mErr) throw new Error(mErr.message);

      const priceRows = Object.entries(m.prices || {})
        .filter(([origRangeId]) => rangeIdMap[origRangeId])
        .map(([origRangeId, price]) => ({
          module_id: moduleId,
          range_id:  rangeIdMap[origRangeId],
          price,
        }));
      if (priceRows.length > 0) {
        const { error: mpErr } = await sb.from('module_prices').insert(priceRows);
        if (mpErr) throw new Error(mpErr.message);
      }
    }

    // 4. Options
    const optionRows = (data.options || []).map((o, i) => ({
      id: generateId('opt'), product_id: id,
      name: o.name.trim(), description: o.description?.trim() || '',
      price: o.price, type: o.type || '',
      coefficient: o.coefficient ?? null, sort_order: i,
    }));
    if (optionRows.length > 0) {
      const { error: oErr } = await sb.from('options').insert(optionRows);
      if (oErr) throw new Error(oErr.message);
    }

  } catch (err) {
    // Rollback manuel : supprimer le produit (CASCADE nettoie le reste)
    await sb.from('products').delete().eq('id', id);
    throw err;
  }

  log('product', id, 'created', { name: data.name });
  return getById(id);
}

/**
 * Met à jour un produit (remplace gammes/modules/options)
 */
async function update(id, data) {
  const existing = await getById(id);
  if (!existing) throw new ValidationError(`Produit ${id} non trouvé`);

  validateProduct({ ...existing, ...data });

  const sb = getSupabase();

  // 1. Produit principal
  const { error: pErr } = await sb.from('products').update({
    name:                 data.name?.trim()             ?? existing.name,
    supplier_id:          data.supplier_id              ?? existing.supplier_id,
    collection:           data.collection?.trim()       ?? existing.collection,
    description:          data.description?.trim()      ?? existing.description,
    valid_from:           data.valid_from               ?? existing.valid_from,
    valid_until:          data.valid_until              ?? existing.valid_until,
    purchase_coefficient: data.purchase_coefficient     ?? existing.purchase_coefficient ?? 2.0,
    price_rounding:       data.price_rounding           ?? existing.price_rounding ?? 'none',
    photo:                data.photo                    ?? existing.photo ?? '',
    supplier_notes:       data.supplier_notes?.trim()   ?? existing.supplier_notes ?? '',
    updated_at:           new Date().toISOString(),
  }).eq('id', id);
  if (pErr) sbErr(pErr);

  // 2. Gammes
  if (data.ranges) {
    await sb.from('ranges').delete().eq('product_id', id);
    for (let i = 0; i < data.ranges.length; i++) {
      const r = data.ranges[i];
      const { error: rErr } = await sb.from('ranges').insert({
        id: r.id || generateId('range'), product_id: id,
        name: r.name.trim(), base_price: r.base_price,
        dimensions: r.dimensions?.trim() || '', sort_order: i,
      });
      if (rErr) sbErr(rErr);
    }
  }

  // 3. Modules + prix
  if (data.modules) {
    await sb.from('modules').delete().eq('product_id', id);
    for (let i = 0; i < data.modules.length; i++) {
      const m = data.modules[i];
      const moduleId = m.id || generateId('mod');
      const { error: mErr } = await sb.from('modules').insert({
        id: moduleId, product_id: id,
        name: m.name.trim(), description: m.description?.trim() || '',
        dimensions: m.dimensions?.trim() || '', sort_order: i,
      });
      if (mErr) sbErr(mErr);

      const priceRows = Object.entries(m.prices || {}).map(([rangeId, price]) => ({
        module_id: moduleId, range_id: rangeId, price,
      }));
      if (priceRows.length > 0) {
        const { error: mpErr } = await sb.from('module_prices').insert(priceRows);
        if (mpErr) sbErr(mpErr);
      }
    }
  }

  // 4. Options
  if (data.options !== undefined) {
    await sb.from('options').delete().eq('product_id', id);
    const optionRows = data.options.map((o, i) => ({
      id: o.id || generateId('opt'), product_id: id,
      name: o.name.trim(), description: o.description?.trim() || '',
      price: o.price, type: o.type || '',
      coefficient: o.coefficient ?? null, sort_order: i,
    }));
    if (optionRows.length > 0) {
      const { error: oErr } = await sb.from('options').insert(optionRows);
      if (oErr) sbErr(oErr);
    }
  }

  log('product', id, 'updated');
  return getById(id);
}

/**
 * Archive un produit (soft delete)
 */
async function archive(id) {
  const sb = getSupabase();
  const existing = await getById(id);
  if (!existing) throw new ValidationError(`Produit ${id} non trouvé`);

  const { error } = await sb.from('products')
    .update({ archived: 1, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) sbErr(error);
  log('product', id, 'archived');
}

/**
 * Restaure un produit archivé
 */
async function restore(id) {
  const sb = getSupabase();
  const { error } = await sb.from('products')
    .update({ archived: 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) sbErr(error);
  log('product', id, 'restored');
}

/**
 * Active ou désactive un produit
 */
async function setActive(id, active) {
  const sb = getSupabase();
  const { error } = await sb.from('products')
    .update({ active: active ? 1 : 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) sbErr(error);
  log('product', id, active ? 'activated' : 'deactivated');
}

/**
 * Duplique un produit
 */
async function duplicate(id) {
  const original = await getById(id);
  if (!original) throw new ValidationError(`Produit ${id} non trouvé`);

  const rangeIdMap = {};
  const newRanges = original.ranges.map(r => {
    const newRangeId = generateId('range');
    rangeIdMap[r.id] = newRangeId;
    return { ...r, id: newRangeId };
  });

  const newData = {
    ...original,
    id: generateId('prod'),
    name: `${original.name} (copie)`,
    ranges: newRanges,
    modules: original.modules.map(m => ({
      ...m,
      id: generateId('mod'),
      prices: Object.fromEntries(
        Object.entries(m.prices || {}).map(([rId, price]) => [rangeIdMap[rId] ?? rId, price])
      ),
    })),
    options: original.options.map(o => ({ ...o, id: generateId('opt') })),
  };

  return create(newData);
}

/**
 * Recherche produits
 */
async function search(term) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('archived', 0)
    .or(`name.ilike.%${term}%,collection.ilike.%${term}%`)
    .order('name');

  if (error) sbErr(error);
  return data.map(normalizeProduct);
}

/**
 * Mise à jour des prix en masse via RPC Postgres
 */
async function bulkUpdatePrices(supplierId, collection, percent) {
  const factor = 1 + (parseFloat(percent) / 100);
  if (isNaN(factor) || factor <= 0) throw new Error('Pourcentage invalide');

  const sb = getSupabase();
  const { data, error } = await sb.rpc('bulk_update_prices', {
    p_supplier_id: supplierId || '',
    p_collection:  collection?.trim() || '',
    p_factor:      factor,
  });

  if (error) sbErr(error);
  log('product', 'bulk', 'prices-updated', { supplierId, collection, percent, ...data });
  return data;
}

/**
 * Suppression définitive d'un produit (CASCADE supprime gammes/modules/options)
 */
async function remove(id) {
  const sb = getSupabase();
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) sbErr(error);
  log('product', id, 'deleted');
}

module.exports = { getAll, getById, create, update, archive, restore, setActive, duplicate, search, bulkUpdatePrices, remove };
