'use strict';

/**
 * CompositionService — CRUD compositions (Supabase)
 */

const { getSupabase } = require('../db/supabase');

function sbErr(error) {
  throw new Error(error.message || 'Erreur Supabase');
}

async function getAll() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('compositions')
    .select('id, name, product_id, modules_json, thumbnail_svg, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) sbErr(error);
  return data || [];
}

async function getById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('compositions').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    sbErr(error);
  }
  return data;
}

async function save(data) {
  if (!data.name || !String(data.name).trim()) throw new Error('Le nom de la composition est requis');

  const sb      = getSupabase();
  const payload = {
    name:          String(data.name).trim(),
    product_id:    data.product_id    || null,
    modules_json:  data.modules_json  || '[]',
    thumbnail_svg: data.thumbnail_svg || null,
    updated_at:    new Date().toISOString(),
  };

  if (data.id) {
    const { error } = await sb.from('compositions').update(payload).eq('id', data.id);
    if (error) sbErr(error);
    return getById(data.id);
  } else {
    const { data: inserted, error } = await sb.from('compositions').insert(payload).select().single();
    if (error) sbErr(error);
    return inserted;
  }
}

async function remove(id) {
  const sb = getSupabase();
  const { error } = await sb.from('compositions').delete().eq('id', id);
  if (error) sbErr(error);
  return true;
}

module.exports = { getAll, getById, save, remove };
