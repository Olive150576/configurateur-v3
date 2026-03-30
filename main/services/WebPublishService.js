/**
 * WebPublishService — Publie un produit du configurateur vers le site mildecor.fr
 *
 * Flux :
 *  1. Le renderer convertit la photo en WebP (Canvas API) et envoie le buffer
 *  2. Ce service uploade le WebP dans Supabase Storage du site
 *  3. Il transforme le produit Electron → format site
 *  4. Il fait un upsert dans la table products du site
 */

const { createClient } = require('@supabase/supabase-js');
const { log } = require('../utils/logger');

// ── Credentials du site mildecor.fr ──────────────────────────────────────────
const SITE_URL    = 'https://grtsnlsoohgeykvtwwrj.supabase.co';
const SITE_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHNubHNvb2hnZXlrdnR3d3JqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU4NTExNywiZXhwIjoyMDkwMTYxMTE3fQ.RAytr6kykSiqwHFxb7cROe4mWLwpHwYsXxktsl1l3Ao';
const SITE_BUCKET = 'images';

let _client = null;
function getSite() {
  if (!_client) _client = createClient(SITE_URL, SITE_KEY);
  return _client;
}

// ── Upload photo WebP vers Storage ────────────────────────────────────────────
async function uploadPhoto(webpBuffer) {
  const sb       = getSite();
  const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}.webp`;
  const path     = `products/${filename}`;

  const { error } = await sb.storage
    .from(SITE_BUCKET)
    .upload(path, webpBuffer, { contentType: 'image/webp', upsert: true });

  if (error) throw new Error(`Upload photo échoué : ${error.message}`);

  const { data } = sb.storage.from(SITE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── Transformation Electron → site ───────────────────────────────────────────
// ── Upload plusieurs photos WebP vers Storage ─────────────────────────────────
async function uploadPhotos(buffers) {
  return Promise.all(buffers.map(buf => uploadPhoto(buf)));
}

function buildSiteProduct(product, webSettings, imageUrls) {
  const imageUrl = (imageUrls && imageUrls.length > 0) ? imageUrls[0] : null;

  // Modules : { name, dims }
  const modules = (product.modules || []).map(m => ({
    name: m.name.trim(),
    dims: m.dimensions?.trim() || '',
  }));

  // Options : { name, choices } — chaque option devient un groupe
  const options = (product.options || []).length
    ? [{ name: 'Options', choices: (product.options).map(o => o.name.trim()) }]
    : [];

  // Matières : depuis le champ texte libre saisi dans le dialogue de publication
  const materials = (webSettings.materials || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  return {
    name:             product.name.trim(),
    category:         webSettings.category,
    subcat:           webSettings.subcat?.trim() || '',
    description:      webSettings.description?.trim() || product.description?.split('\n')[0]?.trim() || '',
    description_full: product.description?.trim() || '',
    composition:      webSettings.composition?.trim() || '',
    badge:            webSettings.badge?.trim() || null,
    materials,
    featured:         !!webSettings.featured,
    is_destockage:    !!product.is_destockage,
    destockage_price: product.destockage_price || null,
    image:            imageUrl || null,
    images:           imageUrls && imageUrls.length > 0 ? imageUrls : [],
    modules,
    options,
    order:            0,
  };
}

// ── Recherche d'un produit existant sur le site (par nom + catégorie) ─────────
async function findSiteProduct(name, category) {
  const sb = getSite();
  const { data } = await sb
    .from('products')
    .select('id, image, images')
    .ilike('name', name.trim())
    .eq('category', category)
    .limit(1);
  return data && data.length ? data[0] : null;
}

// ── Point d'entrée principal ──────────────────────────────────────────────────
/**
 * @param {object}   product     - Produit normalisé (depuis ProductService.getById)
 * @param {object}   webSettings - { category, subcat, description, composition, badge, materials, featured }
 * @param {Buffer[]} buffers     - Tableau de buffers WebP (un par photo)
 * @returns {object} { id, url } - ID du produit sur le site + URL publique
 */
async function publish(product, webSettings, buffers) {
  const sb = getSite();

  // 1. Upload toutes les photos si fournies
  let imageUrls = [];
  if (buffers && buffers.length > 0) {
    imageUrls = await uploadPhotos(buffers);
  }

  // 2. Chercher si ce produit existe déjà sur le site
  const existing = await findSiteProduct(product.name, webSettings.category);

  // 3. Construire l'objet site
  const siteProduct = buildSiteProduct(product, webSettings, imageUrls);

  // Si pas de nouvelles photos mais déjà des photos sur le site → les conserver
  if (imageUrls.length === 0 && existing) {
    siteProduct.image  = existing.image;
    siteProduct.images = existing.images || [];
  }

  let resultId;

  if (existing) {
    // UPDATE
    const { error } = await sb
      .from('products')
      .update(siteProduct)
      .eq('id', existing.id);
    if (error) throw new Error(`Mise à jour site : ${error.message}`);
    resultId = existing.id;
    log('web-publish', product.id, 'updated', { siteId: resultId });
  } else {
    // INSERT avec un ID timestamp (même convention que ALLEGRA)
    const newId = Date.now();
    const { error } = await sb
      .from('products')
      .insert({ id: newId, ...siteProduct });
    if (error) throw new Error(`Publication site : ${error.message}`);
    resultId = newId;
    log('web-publish', product.id, 'created', { siteId: resultId });
  }

  return {
    id:  resultId,
    url: `https://mildecor.fr/#product-${resultId}`,
  };
}

// ── Dépublication (supprime du site uniquement) ───────────────────────────────
async function unpublish(productName, category) {
  const sb       = getSite();
  const existing = await findSiteProduct(productName, category);
  if (!existing) throw new Error('Produit introuvable sur le site');

  const { error } = await sb.from('products').delete().eq('id', existing.id);
  if (error) throw new Error(`Suppression site : ${error.message}`);
  log('web-publish', productName, 'removed', { siteId: existing.id });
}

module.exports = { publish, unpublish, findSiteProduct };
