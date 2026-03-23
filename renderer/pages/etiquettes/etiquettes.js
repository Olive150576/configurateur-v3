/**
 * etiquettes.js — Page de configuration des étiquettes magasin
 *
 * Concept : l'utilisateur CONSTRUIT des configurations (tuiles).
 * Chaque tuile = un module (ou gamme) + des options en quantité → prix de vente additionné.
 * Les tuiles s'affichent 3 par ligne sur l'étiquette imprimée.
 */

'use strict';

let allProducts      = [];
let filteredProducts = [];
let selectedProduct  = null;
let companyLogo      = '';
let vatRate          = 20;

/** Tuiles construites par l'utilisateur. Chaque tuile = { id, title, salePrice } */
let tileCombinations = [];

// ── Helpers prix ──────────────────────────────────────────────────────────────

function applyRounding(price, mode) {
  if (mode === 'integer') return Math.round(price);
  if (mode === 'ten')     return Math.round(price / 10) * 10;
  return Math.round(price * 100) / 100;
}

function salePrice(purchasePrice, coeff, rounding) {
  return applyRounding((purchasePrice || 0) * coeff * (1 + vatRate / 100), rounding);
}

function formatPrice(n) {
  if (!n && n !== 0) return '—';
  const rounded = Math.round(n * 100) / 100;
  const str = rounded.toFixed(2);
  const [int, dec] = str.split('.');
  const intStr = Number(int).toLocaleString('fr-FR');
  return dec === '00' ? `${intStr} €` : `${intStr},${dec} €`;
}

function getCoeff()    { return selectedProduct?.purchase_coefficient ?? 2.0; }
function getRounding() { return selectedProduct?.price_rounding ?? 'none'; }

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const [logoRes, vatRes] = await Promise.all([
    window.api.app.getConfig('company_logo').catch(() => ({ ok: false, data: '' })),
    window.api.app.getConfig('vat_rate').catch(() => ({ ok: false, data: '' })),
  ]);
  companyLogo = logoRes?.ok ? (logoRes.data || '') : '';
  vatRate = parseFloat(vatRes?.ok ? vatRes.data : '') || 20;

  const res = await window.api.products.getAll().catch(() => ({ ok: false, data: [] }));
  allProducts = (res.ok ? res.data : []).filter(p => p.active && !p.archived);
  filteredProducts = allProducts;
  renderList();

  document.getElementById('catalog-filter').addEventListener('input', onFilter);
  document.getElementById('input-tissu').addEventListener('input', updatePreview);
  document.getElementById('btn-add-tile').addEventListener('click', addTile);
  document.getElementById('btn-open-print').addEventListener('click', openPrint);
});

// ── Liste produits ────────────────────────────────────────────────────────────

function onFilter(e) {
  const term = e.target.value.trim().toLowerCase();
  filteredProducts = term
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.supplier_name || '').toLowerCase().includes(term) ||
        (p.collection    || '').toLowerCase().includes(term))
    : allProducts;
  renderList();
}

function renderList() {
  const listEl = document.getElementById('catalog-list');
  if (!filteredProducts.length) {
    listEl.innerHTML = '<div class="catalog-empty">Aucun produit trouvé.</div>';
    return;
  }
  listEl.innerHTML = filteredProducts.map(p => `
    <div class="product-card ${selectedProduct?.id === p.id ? 'selected' : ''}" data-id="${p.id}">
      <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
      ${p.supplier_name || p.collection
        ? `<div class="product-card-meta">${Utils.escapeHtml(
            [p.supplier_name, p.collection].filter(Boolean).join(' · ')
          )}</div>`
        : ''}
    </div>`).join('');

  listEl.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => selectProduct(card.dataset.id));
  });
}

// ── Sélection produit ─────────────────────────────────────────────────────────

async function selectProduct(productId) {
  const indicator = document.getElementById('loading-indicator');
  indicator.style.display = 'inline';

  try {
    const res = await window.api.products.getById(productId);
    const prod = res?.ok ? res.data : null;
    if (!prod) return;

    selectedProduct  = prod;
    tileCombinations = [];

    renderList();

    document.getElementById('empty-state').style.display = 'none';
    const content = document.getElementById('config-content');
    content.style.display = 'flex';

    document.getElementById('input-tissu').value = '';
    document.getElementById('input-badge').value = '';

    renderBuilder();
    renderTilesList();
    updatePreview();

  } catch (e) {
    Utils.toast('Erreur : ' + e.message, 'error');
  } finally {
    indicator.style.display = 'none';
  }
}

// ── Builder de configuration ──────────────────────────────────────────────────

function renderBuilder() {
  const product    = selectedProduct;
  const hasModules = (product.modules || []).length > 0;
  const ranges     = product.ranges  || [];
  const options    = product.options || [];

  // ── Gamme de tarification (seulement si modules) ──
  const rangeGroup  = document.getElementById('builder-range-group');
  const rangeSelect = document.getElementById('builder-range');
  rangeGroup.style.display = hasModules && ranges.length ? '' : 'none';
  rangeSelect.innerHTML = ranges.map(r =>
    `<option value="${r.id}">${Utils.escapeHtml(r.name)}${r.dimensions ? ' — ' + Utils.escapeHtml(r.dimensions) : ''}</option>`
  ).join('');
  rangeSelect.onchange = updateBuilderPrice;

  // ── Base : module ou gamme ──
  const baseLabel  = document.getElementById('builder-base-label');
  const baseSelect = document.getElementById('builder-base');
  baseLabel.textContent = hasModules ? 'Module principal' : 'Configuration (gamme)';

  if (hasModules) {
    baseSelect.innerHTML = product.modules.map(m =>
      `<option value="${m.id}">${Utils.escapeHtml(m.name)}${m.dimensions ? ' — ' + Utils.escapeHtml(m.dimensions) : ''}</option>`
    ).join('');
  } else {
    baseSelect.innerHTML = ranges.map(r =>
      `<option value="${r.id}">${Utils.escapeHtml(r.name)}${r.dimensions ? ' — ' + Utils.escapeHtml(r.dimensions) : ''}</option>`
    ).join('');
  }
  baseSelect.onchange = updateBuilderPrice;

  // ── Options avec quantité ──
  const optsContainer = document.getElementById('builder-options-container');
  const optsEl        = document.getElementById('builder-options');

  if (options.length) {
    optsContainer.style.display = '';
    optsEl.innerHTML = options.map(o => {
      const pv = salePrice(o.price, getCoeff(), getRounding());
      return `
        <div class="builder-option-row"
             data-option-id="${o.id}"
             data-option-name="${Utils.escapeHtml(o.name)}"
             data-option-price="${o.price}">
          <span class="builder-option-name">${Utils.escapeHtml(o.name)}</span>
          <span class="builder-option-unit">${formatPrice(pv)} / unité</span>
          <div class="qty-control">
            <button class="qty-btn" data-dir="-1">−</button>
            <input type="number" class="qty-input" value="0" min="0" max="10" step="1">
            <button class="qty-btn" data-dir="1">+</button>
          </div>
        </div>`;
    }).join('');

    optsEl.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.builder-option-row').querySelector('.qty-input');
        const dir   = parseInt(btn.dataset.dir);
        input.value = Math.max(0, Math.min(10, (parseInt(input.value) || 0) + dir));
        updateBuilderPrice();
      });
    });
    optsEl.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('input', updateBuilderPrice);
    });
  } else {
    optsContainer.style.display = 'none';
    optsEl.innerHTML = '';
  }

  updateBuilderPrice();
}

function updateBuilderPrice() {
  const product    = selectedProduct;
  if (!product) return;
  const hasModules = (product.modules || []).length > 0;
  const coeff      = getCoeff();
  const rounding   = getRounding();

  let basePurchase = 0;
  if (hasModules) {
    const rangeId  = document.getElementById('builder-range').value;
    const moduleId = document.getElementById('builder-base').value;
    const mod      = (product.modules || []).find(m => m.id === moduleId);
    basePurchase   = mod?.prices?.[rangeId] ?? 0;
  } else {
    const rangeId  = document.getElementById('builder-base').value;
    const range    = (product.ranges || []).find(r => r.id === rangeId);
    basePurchase   = range?.base_price ?? 0;
  }

  let extrasPurchase = 0;
  document.querySelectorAll('#builder-options .builder-option-row').forEach(row => {
    const qty  = parseInt(row.querySelector('.qty-input').value) || 0;
    const unit = parseFloat(row.dataset.optionPrice) || 0;
    extrasPurchase += qty * unit;
  });

  const totalSale = salePrice(basePurchase + extrasPurchase, coeff, rounding);
  document.getElementById('builder-price').textContent = formatPrice(totalSale);
}

// ── Ajouter une tuile ─────────────────────────────────────────────────────────

function addTile() {
  const product    = selectedProduct;
  if (!product) return;
  const hasModules = (product.modules || []).length > 0;
  const coeff      = getCoeff();
  const rounding   = getRounding();

  // Base
  let baseName       = '';
  let baseDimensions = '';
  let basePurchase   = 0;

  if (hasModules) {
    const rangeId  = document.getElementById('builder-range').value;
    const moduleId = document.getElementById('builder-base').value;
    const mod      = (product.modules || []).find(m => m.id === moduleId);
    baseName       = mod?.name || '';
    baseDimensions = mod?.dimensions || '';
    basePurchase   = mod?.prices?.[rangeId] ?? 0;
  } else {
    const rangeId  = document.getElementById('builder-base').value;
    const range    = (product.ranges || []).find(r => r.id === rangeId);
    baseName       = range?.name || '';
    baseDimensions = range?.dimensions || '';
    basePurchase   = range?.base_price ?? 0;
  }

  // Extras (options avec qty > 0)
  const extras = [];
  let extrasPurchase = 0;
  document.querySelectorAll('#builder-options .builder-option-row').forEach(row => {
    const qty  = parseInt(row.querySelector('.qty-input').value) || 0;
    if (qty > 0) {
      const name = row.dataset.optionName;
      const unit = parseFloat(row.dataset.optionPrice) || 0;
      extras.push({ name, qty, unit });
      extrasPurchase += qty * unit;
    }
  });

  const totalSale = salePrice(basePurchase + extrasPurchase, coeff, rounding);

  // Titre auto-généré
  let title = baseName.toUpperCase();
  if (extras.length) {
    title += ' + ' + extras
      .map(e => `${e.qty > 1 ? e.qty + ' × ' : ''}${e.name.toUpperCase()}`)
      .join(' + ');
  }

  tileCombinations.push({ id: Date.now(), title, dimensions: baseDimensions, salePrice: totalSale });
  renderTilesList();
  updatePreview();

  // Remettre qtys à 0
  document.querySelectorAll('#builder-options .qty-input').forEach(i => { i.value = 0; });
  updateBuilderPrice();
}

// ── Liste des tuiles créées ───────────────────────────────────────────────────

function renderTilesList() {
  const el = document.getElementById('tiles-created');

  if (!tileCombinations.length) {
    el.innerHTML = '<p style="font-size:12px;color:#aaa">Aucune configuration. Créez-en avec le formulaire ci-dessus.</p>';
    return;
  }

  el.innerHTML = tileCombinations.map(t => `
    <div class="tile-created-item">
      <div class="tile-created-info">
        <div class="tile-created-title">${Utils.escapeHtml(t.title)}</div>
        <div class="tile-created-price">${formatPrice(t.salePrice)}</div>
      </div>
      <button class="tile-remove-btn" data-id="${t.id}" title="Supprimer">×</button>
    </div>`).join('');

  el.querySelectorAll('.tile-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tileCombinations = tileCombinations.filter(t => t.id !== Number(btn.dataset.id));
      renderTilesList();
      updatePreview();
    });
  });
}

// ── Aperçu miniature ──────────────────────────────────────────────────────────

function updatePreview() {
  if (!selectedProduct) return;

  document.getElementById('prev-name').textContent = selectedProduct.name;

  const logoEl = document.getElementById('prev-logo');
  logoEl.innerHTML = companyLogo ? `<img src="${companyLogo}">` : 'Logo';

  const photoEl = document.getElementById('prev-photo');
  if (selectedProduct.photo) {
    photoEl.innerHTML = `<img src="${selectedProduct.photo}">`;
  } else {
    photoEl.textContent = 'Photo produit';
  }

  const tissu = document.getElementById('input-tissu').value.trim();
  document.getElementById('prev-tissu').textContent =
    tissu || 'Tissu au choix dans notre sélection';

  // Aperçu des tuiles configurées
  document.getElementById('prev-prices').innerHTML = tileCombinations.slice(0, 3).map(t => `
    <div class="preview-mini-card">
      <div class="preview-mini-range" style="font-size:7px">${Utils.escapeHtml(t.title)}</div>
      <div class="preview-mini-price">${formatPrice(t.salePrice)}</div>
    </div>`).join('');
}

// ── Impression ────────────────────────────────────────────────────────────────

async function openPrint() {
  if (!selectedProduct) return;

  if (!tileCombinations.length) {
    Utils.toast('Créez au moins une configuration avant d\'imprimer.', 'warning');
    return;
  }

  const tissu   = document.getElementById('input-tissu').value.trim();
  const badge   = document.getElementById('input-badge').value.trim();
  const showQR  = document.getElementById('input-show-qr').checked ? '1' : '0';
  const configs = JSON.stringify(tileCombinations.map(t => ({
    title:      t.title,
    price:      t.salePrice,
    dimensions: t.dimensions || '',
  })));

  try {
    await window.api.etiquette.print(selectedProduct.id, { tissu, badge, configs, showQR });
  } catch (e) {
    Utils.toast('Erreur : ' + e.message, 'error');
  }
}
