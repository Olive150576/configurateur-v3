/**
 * catalogue.js — Rendu du catalogue PDF fournisseur
 *
 * Reçoit supplierId en query param, charge tous les produits actifs
 * de ce fournisseur, les dispose en grille 2 colonnes par page A4.
 */

'use strict';

// ── Params ────────────────────────────────────────────────────────────────────

const params     = new URLSearchParams(window.location.search);
const supplierId = params.get('supplierId') || '';
const PRODUCTS_PER_PAGE = 4; // 2 colonnes × 2 lignes

// ── Toolbar ───────────────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => window.close());
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-pdf');
  btn.disabled = true;
  try {
    const title = document.getElementById('toolbar-title').textContent;
    await window.api.print.savePDF(`${title}.pdf`);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('sort-select').addEventListener('change', () => {
  if (window._catalogueProducts && window._catalogueCompany) {
    renderCatalogue(window._catalogueProducts, window._catalogueCompany, window._catalogueQR);
  }
});

// ── Config entreprise ─────────────────────────────────────────────────────────

const CONFIG_KEYS = [
  'company_name', 'company_trade_name',
  'company_address', 'company_zip', 'company_city',
  'company_phone', 'company_email', 'company_website',
  'company_logo',
];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [allProdsRes, ...configResults] = await Promise.all([
      window.api.products.getAll(),
      ...CONFIG_KEYS.map(k => window.api.app.getConfig(k)),
    ]);

    if (!allProdsRes?.ok) { showError('Erreur chargement produits.'); return; }

    const company = {};
    CONFIG_KEYS.forEach((k, i) => {
      company[k] = (configResults[i]?.ok ? configResults[i].data : '') || '';
    });

    let products = allProdsRes.data.filter(p => !p.archived && p.active !== 0);
    if (supplierId) products = products.filter(p => p.supplier_id === supplierId);

    if (products.length === 0) { showError('Aucun produit actif pour ce fournisseur.'); return; }

    const supplierName = products[0]?.supplier_name || 'Catalogue';
    document.getElementById('toolbar-title').textContent = `Catalogue — ${supplierName}`;

    // QR optionnel (logo URL de la société)
    let qrDataUrl = '';
    if (company.company_website || company.company_name) {
      const qrText = company.company_website || company.company_name;
      try {
        const qrRes = await window.api.products.generateQR(qrText);
        if (qrRes?.ok) qrDataUrl = qrRes.data;
      } catch (_) {}
    }

    window._catalogueProducts = products;
    window._catalogueCompany  = company;
    window._catalogueQR       = qrDataUrl;

    renderCatalogue(products, company, qrDataUrl);
  } catch (e) {
    showError('Erreur : ' + e.message);
  }
});

function showError(msg) {
  document.getElementById('loading').innerHTML =
    `<div style="color:#c00">${escHtml(msg)}</div>`;
}

// ── Tri ───────────────────────────────────────────────────────────────────────

function sortProducts(products) {
  const mode = document.getElementById('sort-select').value;
  const list = [...products];
  switch (mode) {
    case 'collection': return list.sort((a, b) =>
      (a.collection || '').localeCompare(b.collection || '') ||
      a.name.localeCompare(b.name));
    case 'price-asc': return list.sort((a, b) => minPrice(a) - minPrice(b));
    case 'price-desc': return list.sort((a, b) => minPrice(b) - minPrice(a));
    default: return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function minPrice(p) {
  const coeff = p.purchase_coefficient ?? 2;
  const prices = (p.ranges || []).map(r => r.base_price * coeff);
  return prices.length ? Math.min(...prices) : 0;
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

function renderCatalogue(products, company, qrDataUrl) {
  const sorted      = sortProducts(products);
  const supplierName = sorted[0]?.supplier_name || '';
  const companyName  = company.company_trade_name || company.company_name || '';
  const logo         = company.company_logo || '';
  const totalPages   = Math.ceil(sorted.length / PRODUCTS_PER_PAGE);

  const pagesEl = document.getElementById('catalogue-pages');
  pagesEl.innerHTML = '';

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageProducts = sorted.slice(pageIdx * PRODUCTS_PER_PAGE, (pageIdx + 1) * PRODUCTS_PER_PAGE);
    const pageNum = pageIdx + 1;

    const pageEl = document.createElement('div');
    pageEl.className = 'catalogue-page';
    pageEl.innerHTML = `
      ${renderPageHeader(logo, supplierName, companyName, company, qrDataUrl, pageNum, totalPages)}
      <div class="gold-rule"></div>
      <div class="products-grid">
        ${pageProducts.map(p => renderProductCard(p)).join('')}
      </div>
      <div class="cat-footer">
        <div class="cat-footer-left">
          Tarifs indicatifs TTC — ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}
        </div>
        <div class="cat-footer-right">${escHtml(companyName)}</div>
      </div>
    `;
    pagesEl.appendChild(pageEl);
  }

  document.getElementById('loading').style.display = 'none';
  pagesEl.style.display = 'flex';
}

function renderPageHeader(logo, supplierName, companyName, company, qrDataUrl, pageNum, totalPages) {
  return `
    <div class="cat-header">
      <div class="cat-header-left">
        <div class="cat-logo">
          ${logo
            ? `<img src="${logo}" alt="Logo">`
            : `<div class="cat-logo-placeholder">Logo</div>`}
        </div>
        <div>
          <div class="cat-header-title">Catalogue</div>
          <div class="cat-header-supplier">${escHtml(supplierName || 'Tous fournisseurs')}</div>
        </div>
      </div>
      <div class="cat-header-right">
        <div class="cat-header-company">${escHtml(companyName)}</div>
        <div class="cat-header-addr">
          ${escHtml(company.company_address || '')}
          ${company.company_zip || company.company_city
            ? `<br>${escHtml([company.company_zip, company.company_city].filter(Boolean).join(' '))}`
            : ''}
          ${company.company_phone ? `<br>${escHtml(company.company_phone)}` : ''}
        </div>
        <div class="cat-header-page">Page ${pageNum} / ${totalPages}</div>
      </div>
    </div>`;
}

function renderProductCard(p) {
  const coeff   = p.purchase_coefficient ?? 2;
  const rounding = p.price_rounding ?? 'none';

  const ranges = (p.ranges || []).map(r => ({
    ...r,
    salePrice: applyRounding(r.base_price * coeff, rounding),
  }));

  return `
    <div class="product-card">
      <div class="pc-header">
        <div class="pc-photo">
          ${p.photo
            ? `<img src="${p.photo}" alt="${escHtml(p.name)}">`
            : `<div class="pc-photo-placeholder">Photo</div>`}
        </div>
        <div class="pc-info">
          ${p.collection ? `<div class="pc-collection">${escHtml(p.collection)}</div>` : ''}
          <div class="pc-name">${escHtml(p.name)}</div>
          ${p.supplier_name ? `<div class="pc-supplier">${escHtml(p.supplier_name)}</div>` : ''}
          ${p.description
            ? `<div class="pc-desc">${escHtml(p.description.split('\n')[0])}</div>`
            : ''}
        </div>
      </div>

      ${ranges.length ? `
      <div class="pc-ranges">
        ${ranges.map(r => renderRangeRow(r)).join('')}
      </div>` : ''}
    </div>`;
}

function renderRangeRow(r) {
  const [int, dec] = formatPrice(r.salePrice);
  return `
    <div class="pc-range-row">
      <div>
        <span class="pc-range-name">${escHtml(r.name)}</span>
        ${r.dimensions ? `<span class="pc-range-dims">${escHtml(r.dimensions)}</span>` : ''}
      </div>
      <div style="text-align:right">
        <div class="pc-range-price">
          <sup>€</sup>${int}${dec !== '00' ? `<sup style="font-size:8px">${dec}</sup>` : ''}
        </div>
        <div class="pc-range-ttc">TTC</div>
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyRounding(price, mode) {
  if (mode === 'integer') return Math.round(price);
  if (mode === 'ten') {
    const r = Math.round(price);
    const lastDigit = r % 10;
    return lastDigit < 5 ? r - lastDigit : r + (10 - lastDigit);
  }
  return Math.round(price * 100) / 100;
}

function formatPrice(n) {
  if (!n && n !== 0) return ['0', '00'];
  const rounded = Math.round(n * 100) / 100;
  const str = rounded.toFixed(2);
  const [int, dec] = str.split('.');
  return [Number(int).toLocaleString('fr-FR'), dec];
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
