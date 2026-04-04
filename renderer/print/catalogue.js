/**
 * catalogue.js — Catalogue PDF fournisseur
 * Une page A4 par référence produit.
 */

'use strict';

// ── Params ────────────────────────────────────────────────────────────────────

const params     = new URLSearchParams(window.location.search);
const supplierId = params.get('supplierId') || '';

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG_KEYS = [
  'company_name', 'company_trade_name',
  'company_address', 'company_zip', 'company_city',
  'company_phone', 'company_email', 'company_website',
  'company_logo', 'vat_rate',
];

// ── State ─────────────────────────────────────────────────────────────────────

let allProducts = [];

// ── Toolbar ───────────────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => window.close());
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-pdf');
  btn.disabled = true;
  try {
    const title = document.getElementById('toolbar-title').textContent;
    await window.api.print.savePDF(`${title}.pdf`);
  } finally { btn.disabled = false; }
});

// ── Filter panel ──────────────────────────────────────────────────────────────

document.getElementById('btn-filter').addEventListener('click', () => {
  document.getElementById('filter-panel').classList.toggle('open');
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  document.querySelectorAll('#filter-products input[type=checkbox]').forEach(cb => cb.checked = true);
  updateFilterCount();
});

document.getElementById('btn-deselect-all').addEventListener('click', () => {
  document.querySelectorAll('#filter-products input[type=checkbox]').forEach(cb => cb.checked = false);
  updateFilterCount();
});

document.getElementById('btn-apply-filter').addEventListener('click', () => {
  const selected = getSelectedIds();
  const filtered = allProducts.filter(p => selected.has(p.id));
  const vatRate = parseFloat(document.getElementById('filter-panel').dataset.vatRate) || 20;
  const company = JSON.parse(document.getElementById('filter-panel').dataset.company || '{}');
  renderCatalogue(filtered, company, vatRate);
  document.getElementById('filter-panel').classList.remove('open');
  document.getElementById('toolbar-info').textContent =
    `${filtered.length} produit${filtered.length > 1 ? 's' : ''}`;
});

function populateFilterPanel(products, company, vatRate) {
  const container = document.getElementById('filter-products');
  container.innerHTML = products.map(p => `
    <label class="filter-product-item">
      <input type="checkbox" value="${escHtml(p.id)}" checked>
      ${escHtml(p.name)}${p.collection ? ` <span style="color:#bbb;font-size:10px">${escHtml(p.collection)}</span>` : ''}
    </label>
  `).join('');
  container.querySelectorAll('input').forEach(cb => cb.addEventListener('change', updateFilterCount));
  document.getElementById('filter-panel').dataset.vatRate = vatRate;
  document.getElementById('filter-panel').dataset.company = JSON.stringify(company);
  updateFilterCount();
}

function updateFilterCount() {
  const total    = document.querySelectorAll('#filter-products input').length;
  const selected = document.querySelectorAll('#filter-products input:checked').length;
  document.getElementById('filter-count').textContent = `${selected} / ${total} sélectionné(s)`;
}

function getSelectedIds() {
  const ids = new Set();
  document.querySelectorAll('#filter-products input:checked').forEach(cb => ids.add(cb.value));
  return ids;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [allProdsRes, ...configResults] = await Promise.all([
      window.api.products.getAll(),
      ...CONFIG_KEYS.map(k => window.api.app.getConfig(k)),
    ]);

    if (!allProdsRes?.ok) { showError('Erreur chargement produits : ' + (allProdsRes?.error || '')); return; }

    const company = {};
    CONFIG_KEYS.forEach((k, i) => {
      company[k] = (configResults[i]?.ok ? configResults[i].data : '') || '';
    });

    const vatRate = parseFloat(company.vat_rate) || 20;

    // Filtre : non archivés, actifs, et fournisseur si sélectionné
    let products = allProdsRes.data.filter(p => {
      if (p.archived == 1)    return false;
      if (p.active  == 0)     return false;
      if (supplierId && p.supplier_id !== supplierId) return false;
      return true;
    });

    if (products.length === 0) {
      showError('Aucun produit actif trouvé' + (supplierId ? ' pour ce fournisseur' : '') + '.');
      return;
    }

    // Tri alphabétique par défaut
    products.sort((a, b) =>
      (a.collection || '').localeCompare(b.collection || '') ||
      a.name.localeCompare(b.name)
    );

    const supplierName = supplierId ? (products[0]?.supplier_name || '') : 'Tous fournisseurs';
    document.getElementById('toolbar-title').textContent = `Catalogue — ${supplierName}`;
    document.getElementById('toolbar-info').textContent  = `${products.length} produit${products.length > 1 ? 's' : ''}`;

    allProducts = products;
    populateFilterPanel(products, company, vatRate);
    renderCatalogue(products, company, vatRate);

  } catch (e) {
    showError('Erreur inattendue : ' + e.message);
  }
});

function showError(msg) {
  document.getElementById('loading').innerHTML =
    `<div style="color:#c00;padding:40px;text-align:center">${escHtml(msg)}</div>`;
}

// ── Rendu principal — 1 page par produit ──────────────────────────────────────

function renderCatalogue(products, company, vatRate) {
  const pagesEl     = document.getElementById('catalogue-pages');
  const companyName = company.company_trade_name || company.company_name || '';
  const logo        = company.company_logo || '';
  const total       = products.length;

  pagesEl.innerHTML = '';

  products.forEach((p, idx) => {
    const pageEl = document.createElement('div');
    pageEl.className = 'cat-page';
    pageEl.innerHTML = renderProductPage(p, company, logo, companyName, vatRate, idx + 1, total);
    pagesEl.appendChild(pageEl);
  });

  document.getElementById('loading').style.display = 'none';
  pagesEl.style.display = 'flex';
}

// ── Page produit ──────────────────────────────────────────────────────────────

function renderProductPage(p, company, logo, companyName, vatRate, pageNum, total) {
  const coeff    = parseFloat(p.purchase_coefficient) || 2;
  const rounding = p.price_rounding || 'none';

  const ranges = (p.ranges || []).map(r => ({
    ...r,
    // PA × coeff = prix TTC direct
    saleTTC: applyRounding(parseFloat(r.base_price) * coeff, rounding),
  }));

  const modules = p.modules || [];
  const options = p.options || [];

  const descLines = (p.description || '')
    .split('\n')
    .map(l => l.replace(/^[-–—•]\s*/, '').trim())
    .filter(Boolean);

  return `
    ${renderHeader(p, logo, companyName, company, pageNum, total)}
    <div class="gold-rule"></div>

    <div class="cat-body">

      <!-- PHOTO + DESCRIPTION -->
      <div class="cat-top">
        <div class="cat-photo">
          ${p.photo
            ? `<img src="${p.photo}" alt="${escHtml(p.name)}">`
            : `<div class="cat-photo-ph">Photo<br>produit</div>`}
        </div>
        <div class="cat-description">
          <div class="cat-desc-title">Description</div>
          ${descLines.length
            ? `<ul class="cat-desc-list">
                ${descLines.slice(0, 8).map(l => `<li><span>${escHtml(l)}</span></li>`).join('')}
               </ul>`
            : `<p style="font-size:11px;color:#bbb;font-style:italic">Aucune description.</p>`}
        </div>
      </div>

      <!-- MODULES -->
      ${modules.length ? `
      <div class="cat-modules">
        <div class="cat-section-title">Modules disponibles</div>
        <table class="modules-table">
          <thead>
            <tr>
              <th>Module</th>
              <th class="dims-cell">Dimensions</th>
              ${ranges.map(r => `<th class="right">${escHtml(r.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${modules.map(m => renderModuleRow(m, ranges, coeff, rounding)).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- OPTIONS -->
      ${options.length ? `
      <div class="cat-options">
        <div class="cat-section-title" style="margin-bottom:8px">Options & finitions</div>
        <div class="options-list">
          ${options.map(o => renderOptionChip(o, coeff, rounding)).join('')}
        </div>
      </div>` : ''}

    </div>

    ${renderFooter(company, companyName, pageNum, total)}
  `;
}

function renderHeader(p, logo, companyName, company, pageNum, total) {
  return `
    <div class="cat-header">
      <div class="cat-logo">
        ${logo ? `<img src="${logo}" alt="Logo">` : `<div class="cat-logo-ph">Logo</div>`}
      </div>
      <div class="cat-header-mid">
        ${p.collection ? `<div class="cat-collection">${escHtml(p.collection)}</div>` : ''}
        <div class="cat-product-name">${escHtml(p.name)}</div>
        ${p.supplier_name ? `<div class="cat-supplier-name">${escHtml(p.supplier_name)}</div>` : ''}
      </div>
      <div class="cat-header-right">
        <div class="cat-company-name">${escHtml(companyName)}</div>
        <div class="cat-company-addr">
          ${escHtml(company.company_address || '')}
          ${company.company_zip || company.company_city
            ? `<br>${escHtml([company.company_zip, company.company_city].filter(Boolean).join(' '))}`
            : ''}
          ${company.company_phone ? `<br>${escHtml(company.company_phone)}` : ''}
        </div>
        <div class="cat-page-num">Fiche ${pageNum} / ${total}</div>
      </div>
    </div>`;
}

function renderModuleRow(m, ranges, coeff, rounding) {
  // Prix module : PA × coeff = TTC direct
  const priceCells = ranges.map(r => {
    const purchaseHT = parseFloat((m.prices || {})[r.id]);
    if (!purchaseHT) return `<td class="right price-cell" style="color:#ccc">—</td>`;
    const priceTTC = applyRounding(purchaseHT * coeff, rounding);
    return `<td class="right price-cell">${Number(priceTTC).toLocaleString('fr-FR')} €</td>`;
  });

  return `
    <tr>
      <td>${escHtml(m.name)}</td>
      <td class="dims-cell">${escHtml(m.dimensions || '')}</td>
      ${priceCells.join('')}
    </tr>`;
}

function renderOptionChip(o, coeff, rounding) {
  // PA × coeff = TTC direct (utilise le coefficient spécifique de l'option si défini)
  const priceHT     = parseFloat(o.price) || 0;
  const optionCoeff = (o.coefficient !== null && o.coefficient !== undefined)
    ? parseFloat(o.coefficient)
    : coeff;
  const priceTTC = applyRounding(priceHT * optionCoeff, rounding);
  return `
    <div class="opt-chip">
      <span>${escHtml(o.name)}</span>
      ${priceTTC > 0 ? `<span class="opt-chip-price">+${Number(priceTTC).toLocaleString('fr-FR')} €/assise</span>` : ''}
    </div>`;
}

function renderFooter(company, companyName, pageNum, total) {
  return `
    <div class="cat-footer">
      <div class="cat-footer-left">
        ${escHtml(company.company_address || '')}
        ${company.company_zip || company.company_city
          ? `<br>${escHtml([company.company_zip, company.company_city].filter(Boolean).join(' '))}`
          : ''}
      </div>
      <div class="cat-footer-center">${escHtml(companyName)}<br>
        <span style="font-weight:400;color:#bbb;font-size:6.5px">Tarifs TTC indicatifs — ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}</span>
      </div>
      <div class="cat-footer-right">
        ${company.company_phone ? escHtml(company.company_phone) + '<br>' : ''}
        ${company.company_email ? escHtml(company.company_email) + '<br>' : ''}
        ${company.company_website ? escHtml(company.company_website) : ''}
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyRounding(price, mode) {
  if (mode === 'integer') return Math.round(price);
  if (mode === 'ten') {
    const r = Math.round(price);
    const d = r % 10;
    return d < 5 ? r - d : r + (10 - d);
  }
  return Math.round(price * 100) / 100;
}

function formatPrice(n) {
  if (!n && n !== 0) return ['0', '00'];
  const str = (Math.round(n * 100) / 100).toFixed(2);
  const [int, dec] = str.split('.');
  return [Number(int).toLocaleString('fr-FR'), dec];
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
