/**
 * ClientService — CRUD clients via Supabase
 */

const { getSupabase } = require('../db/supabase');
const { validateClient, ValidationError } = require('../utils/validator');
const { log } = require('../utils/logger');

function generateId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function sbErr(error) {
  throw new Error(error.message);
}

async function getAll() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('clients')
    .select('*')
    .order('name');
  if (error) sbErr(error);
  return data;
}

async function getById(id) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    sbErr(error);
  }
  return data;
}

async function create(data) {
  validateClient(data);
  const sb = getSupabase();
  const id = generateId();

  const { error } = await sb.from('clients').insert({
    id,
    name:    data.name.trim(),
    email:   data.email?.trim()   || '',
    phone:   data.phone?.trim()   || '',
    company: data.company?.trim() || '',
    address: data.address?.trim() || '',
    city:    data.city?.trim()    || '',
    zip:     data.zip?.trim()     || '',
    notes:   data.notes?.trim()   || '',
  });
  if (error) sbErr(error);

  log('client', id, 'created', { name: data.name });
  return getById(id);
}

async function update(id, data) {
  const existing = await getById(id);
  if (!existing) throw new ValidationError(`Client ${id} non trouvé`);

  validateClient({ ...existing, ...data });
  const sb = getSupabase();

  const { error } = await sb.from('clients').update({
    name:       data.name?.trim()    ?? existing.name,
    email:      data.email?.trim()   ?? existing.email,
    phone:      data.phone?.trim()   ?? existing.phone,
    company:    data.company?.trim() ?? existing.company,
    address:    data.address?.trim() ?? existing.address,
    city:       data.city?.trim()    ?? existing.city,
    zip:        data.zip?.trim()     ?? existing.zip,
    notes:      data.notes?.trim()   ?? existing.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) sbErr(error);

  log('client', id, 'updated');
  return getById(id);
}

async function search(term) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('clients')
    .select('*')
    .or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('name');
  if (error) sbErr(error);
  return data;
}

/**
 * Exporte tous les clients au format CSV
 */
async function exportCSV() {
  const clients = await getAll();
  const headers = ['name', 'company', 'email', 'phone', 'address', 'city', 'zip', 'notes'];
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = clients.map(c => headers.map(h => escape(c[h])).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Importe des clients depuis un tableau de lignes CSV parsées
 */
async function importCSV(rows) {
  let imported = 0;
  const errors = [];
  for (const row of rows) {
    try {
      await create(row);
      imported++;
    } catch (e) {
      errors.push(`${row.name ?? '?'}: ${e.message}`);
    }
  }
  return { imported, errors };
}

async function remove(id) {
  const sb = getSupabase();
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) sbErr(error);
  log('client', id, 'deleted');
}

module.exports = { getAll, getById, create, update, search, exportCSV, importCSV, remove };
