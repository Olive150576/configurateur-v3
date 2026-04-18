/**
 * DocumentService — Cycle de vie complet des documents (Supabase)
 */

const { getSupabase } = require('../db/supabase');
const { validateDocument, validateTransition, ValidationError } = require('../utils/validator');
const { log } = require('../utils/logger');

function generateId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function sbErr(error) {
  throw new Error(error.message || 'Erreur Supabase');
}

/**
 * Normalise un document Supabase vers le format attendu par le renderer.
 * Supabase retourne JSONB déjà parsé en objet JS.
 */
function normalize(doc) {
  if (!doc) return null;
  const cs = typeof doc.client_snapshot  === 'string' ? JSON.parse(doc.client_snapshot)  : (doc.client_snapshot  || {});
  const ps = typeof doc.product_snapshot === 'string' ? JSON.parse(doc.product_snapshot) : (doc.product_snapshot || {});
  return {
    ...doc,
    client_name:      cs.name || '',
    client_snapshot:  cs,
    product_snapshot: ps,
  };
}

/**
 * Récupère tous les documents avec filtres optionnels
 */
async function getAll(filters = {}) {
  const sb = getSupabase();
  let query = sb.from('documents').select('*').order('created_at', { ascending: false });

  if (filters.type)      query = query.eq('type',      filters.type);
  if (filters.status)    query = query.eq('status',    filters.status);
  if (filters.client_id) query = query.eq('client_id', filters.client_id);
  if (filters.search)    query = query.or(`number.ilike.%${filters.search}%`);
  if (filters.limit)     query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) sbErr(error);
  return (data || []).map(normalize);
}

/**
 * Récupère un document par ID
 */
async function getById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('documents').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    sbErr(error);
  }
  return normalize(data);
}

/**
 * Crée un brouillon (sans numéro)
 */
async function create(data) {
  validateDocument(data);

  const sb = getSupabase();
  const id = generateId();

  const { error } = await sb.from('documents').insert({
    id,
    type:             data.type,
    status:           'draft',
    client_id:        data.client_id        || null,
    client_snapshot:  data.client_snapshot  || {},
    product_snapshot: data.product_snapshot || {},
    subtotal:         data.subtotal,
    discount_percent: data.discount_percent,
    discount_amount:  data.discount_amount,
    total:            data.total,
    deposit_percent:  data.deposit_percent,
    deposit_amount:   data.deposit_amount,
    balance:          data.balance,
    notes:            data.notes            || '',
    parent_id:        data.parent_id        || null,
    composition_svg:  data.composition_svg  || null,
    composition_json: data.composition_json || null,
    product_photo:    data.product_photo    || null,
  });

  if (error) sbErr(error);
  log('document', id, 'created', { type: data.type });
  return getById(id);
}

/**
 * Met à jour un brouillon (impossible si validé)
 */
async function update(id, data) {
  const existing = await getById(id);
  if (!existing) throw new ValidationError(`Document ${id} non trouvé`);
  if (existing.status !== 'draft') {
    throw new ValidationError('Seul un brouillon peut être modifié');
  }

  validateDocument({ ...existing, ...data });

  const sb = getSupabase();
  const { error } = await sb.from('documents').update({
    type:             data.type             ?? existing.type,
    client_id:        data.client_id        ?? existing.client_id,
    client_snapshot:  data.client_snapshot  ?? existing.client_snapshot,
    product_snapshot: data.product_snapshot ?? existing.product_snapshot,
    subtotal:         data.subtotal         ?? existing.subtotal,
    discount_percent: data.discount_percent ?? existing.discount_percent,
    discount_amount:  data.discount_amount  ?? existing.discount_amount,
    total:            data.total            ?? existing.total,
    deposit_percent:  data.deposit_percent  ?? existing.deposit_percent,
    deposit_amount:   data.deposit_amount   ?? existing.deposit_amount,
    balance:          data.balance          ?? existing.balance,
    notes:            data.notes            ?? existing.notes,
    composition_svg:  'composition_svg'  in data ? (data.composition_svg  || null) : existing.composition_svg,
    composition_json: 'composition_json' in data ? (data.composition_json || null) : existing.composition_json,
    product_photo:    'product_photo'    in data ? (data.product_photo    || null) : existing.product_photo,
    updated_at:       new Date().toISOString(),
  }).eq('id', id);

  if (error) sbErr(error);
  log('document', id, 'updated');
  return getById(id);
}

/**
 * Valide un brouillon → attribue un numéro définitif (via fonction Postgres atomique)
 */
async function validate(id) {
  const doc = await getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);

  validateTransition(doc.status, 'validated');

  const sb = getSupabase();

  // Génération atomique via RPC Postgres
  const { data: number, error: numErr } = await sb.rpc('generate_document_number', { p_type: doc.type });
  if (numErr) sbErr(numErr);

  const { error } = await sb.from('documents').update({
    status:       'validated',
    number,
    validated_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('id', id);

  if (error) sbErr(error);
  log('document', id, 'validated', { number });
  return getById(id);
}

/**
 * Transition de statut (envoyé, archivé, annulé…)
 */
async function transition(id, toStatus) {
  const doc = await getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);

  validateTransition(doc.status, toStatus);

  const sb = getSupabase();
  const extra = toStatus === 'ordered' ? { ordered_at: new Date().toISOString() } : {};

  const { error } = await sb.from('documents').update({
    status:     toStatus,
    updated_at: new Date().toISOString(),
    ...extra,
  }).eq('id', id);

  if (error) sbErr(error);
  log('document', id, `status_${toStatus}`);
  return getById(id);
}

/**
 * Transforme un devis en commande
 */
async function transform(id, targetType) {
  const source = await getById(id);
  if (!source) throw new ValidationError(`Document ${id} non trouvé`);

  if (!['validated', 'sent'].includes(source.status)) {
    throw new ValidationError('Seul un document validé ou envoyé peut être transformé');
  }
  if (targetType !== 'commande') {
    throw new ValidationError('La transformation crée toujours une commande');
  }

  const sb     = getSupabase();
  const newId  = generateId();

  // Numéro commande atomique
  const { data: newNumber, error: numErr } = await sb.rpc('generate_document_number', { p_type: 'commande' });
  if (numErr) sbErr(numErr);

  const { error: insErr } = await sb.from('documents').insert({
    id:               newId,
    number:           newNumber,
    type:             'commande',
    status:           'ordered',
    client_id:        source.client_id,
    client_snapshot:  source.client_snapshot,
    product_snapshot: source.product_snapshot,
    subtotal:         source.subtotal,
    discount_percent: source.discount_percent,
    discount_amount:  source.discount_amount,
    total:            source.total,
    deposit_percent:  source.deposit_percent,
    deposit_amount:   source.deposit_amount,
    balance:          source.balance,
    notes:            source.notes,
    parent_id:        source.id,
    composition_svg:  source.composition_svg  || null,
    composition_json: source.composition_json || null,
    product_photo:    source.product_photo    || null,
    validated_at:     new Date().toISOString(),
    ordered_at:       new Date().toISOString(),
  });
  if (insErr) sbErr(insErr);

  const { error: updErr } = await sb.from('documents').update({
    status:     'ordered',
    ordered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (updErr) sbErr(updErr);

  log('document', newId, 'created_from_transform', { source_id: id, number: newNumber });
  log('document', id,    'transformed',            { into: newId });
  return getById(newId);
}

/**
 * Duplique un document → nouveau brouillon
 */
async function duplicate(id) {
  const source = await getById(id);
  if (!source) throw new ValidationError(`Document ${id} non trouvé`);

  const created = await create({
    type:             source.type,
    client_id:        source.client_id,
    client_snapshot:  source.client_snapshot,
    product_snapshot: source.product_snapshot,
    subtotal:         source.subtotal,
    discount_percent: source.discount_percent,
    discount_amount:  source.discount_amount,
    total:            source.total,
    deposit_percent:  source.deposit_percent,
    deposit_amount:   source.deposit_amount,
    balance:          source.balance,
    notes:            source.notes,
    parent_id:        null,
  });

  log('document', created.id, 'duplicated_from', { source_id: id });
  return created;
}

/**
 * Supprime définitivement un document
 */
async function remove(id) {
  const doc = await getById(id);
  if (!doc) throw new ValidationError(`Document ${id} non trouvé`);

  const sb = getSupabase();
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) sbErr(error);

  log('document', id, 'deleted', { number: doc.number, type: doc.type });
  return true;
}

module.exports = { getAll, getById, create, update, validate, transition, transform, duplicate, remove };
