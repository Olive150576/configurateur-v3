/**
 * SupplierService — Gestion des fournisseurs via Supabase
 */

const { getSupabase } = require('../db/supabase');
const { log } = require('../utils/logger');

function generateId() {
  return `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function sbErr(error) {
  throw new Error(error.message);
}

const FIELDS = {
  name: '', address: '', city: '', zip: '', phone: '', email: '',
  contact: '', contact_phone: '', contact_email: '',
  commercial_name: '', commercial_phone: '', commercial_email: '',
  sav_name: '', sav_phone: '', sav_email: '',
  delivery_weeks: '',
};

function normalize(data) {
  const row = {};
  for (const [key, def] of Object.entries(FIELDS)) {
    row[key] = data[key]?.trim() ?? def;
  }
  return row;
}

async function getAll() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('suppliers')
    .select('*')
    .eq('active', 1)
    .order('name');
  if (error) sbErr(error);
  return data;
}

async function getById(id) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    sbErr(error);
  }
  return data;
}

async function findByName(name) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('suppliers')
    .select('*')
    .ilike('name', name)
    .maybeSingle();
  if (error) sbErr(error);
  return data;
}

/**
 * Trouve ou crée un fournisseur par nom.
 */
async function findOrCreate(name) {
  if (!name?.trim()) return null;
  const existing = await findByName(name.trim());
  if (existing) return existing;

  const sb = getSupabase();
  const id = generateId();
  const { error } = await sb.from('suppliers').insert({ id, name: name.trim() });
  if (error) sbErr(error);
  log('supplier', id, 'created', { name });
  return getById(id);
}

async function create(data) {
  if (!data.name?.trim()) throw new Error('Nom fournisseur obligatoire');
  const sb = getSupabase();
  const id = generateId();
  const { error } = await sb.from('suppliers').insert({ id, ...normalize(data) });
  if (error) sbErr(error);
  log('supplier', id, 'created', { name: data.name });
  return getById(id);
}

async function update(id, data) {
  const sb = getSupabase();
  const { error } = await sb.from('suppliers')
    .update({ ...normalize(data), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) sbErr(error);
  log('supplier', id, 'updated');
  return getById(id);
}

async function search(term) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('suppliers')
    .select('*')
    .eq('active', 1)
    .or(`name.ilike.%${term}%,contact.ilike.%${term}%,commercial_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('name');
  if (error) sbErr(error);
  return data;
}

async function archive(id) {
  const sb = getSupabase();
  const { error } = await sb.from('suppliers')
    .update({ active: 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) sbErr(error);
  log('supplier', id, 'archived');
}

async function remove(id) {
  const sb = getSupabase();
  // Vérifier s'il y a des produits liés
  const { count, error: countErr } = await sb
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);
  if (countErr) sbErr(countErr);
  if (count > 0) throw new Error(`Impossible de supprimer : ${count} produit(s) sont liés à ce fournisseur.`);

  const { error } = await sb.from('suppliers').delete().eq('id', id);
  if (error) sbErr(error);
  log('supplier', id, 'deleted');
}

module.exports = { getAll, getById, findByName, findOrCreate, create, update, search, archive, remove };
