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

    renderCatalogue(products, company, vatRate);

  } catch (e) {
    showError('Erreur inattendue : ' + e.message);
  }
});

function showError(msg) {
  document.getElementById('loading').innerHTML =
    `<div style="color:#c00;padding:40px;text-align:center">${escHtml(msg)}</div>`;
}

// ── Constantes de pagination ──────────────────────────────────────────────────

/** Nombre max de lignes modules sur la 1re page (qui contient photo + description) */
const ROWS_PAGE1 = 20;
/** Nombre max de lignes modules sur les pages de suite (pas de photo) */
const ROWS_NEXT  = 30;

// ── Rendu principal — pagination automatique par produit ──────────────────────

function renderCatalogue(products, company, vatRate) {
  const pagesEl     = document.getElementById('catalogue-pages');
  const companyName = company.company_trade_name || company.company_name || '';
  const logo        = company.company_logo || '';

  pagesEl.innerHTML = '';

  // Pré-calcul du nombre total de pages A4
  let totalPages = 0;
  const pageCounts = products.map(p => {
    const n     = (p.modules || []).length;
    const pages = n <= ROWS_PAGE1 ? 1 : 1 + Math.ceil((n - ROWS_PAGE1) / ROWS_NEXT);
    totalPages += pages;
    return pages;
  });

  let globalPage = 0;

  products.forEach((p, idx) => {
    const coeff    = parseFloat(p.purchase_coefficient) || 2;
    const rounding = p.price_rounding || 'none';
    const modules  = p.modules || [];
    const options  = p.options || [];
    const ranges   = (p.ranges || []).map(r => ({
      ...r,
      saleTTC: applyRounding(parseFloat(r.base_price) * coeff, rounding),
    }));
    const numPages = pageCounts[idx];

    // Page 1 — avec photo + description
    globalPage++;
    const firstBatch = modules.slice(0, ROWS_PAGE1);
    const isOnly     = numPages === 1;
    const p1 = document.createElement('div');
    p1.className = 'cat-page';
    p1.innerHTML = buildPage(
      p, company, logo, companyName, coeff, rounding, ranges,
      firstBatch, isOnly ? options : [],
      globalPage, totalPages, true
    );
    pagesEl.appendChild(p1);

    // Pages de suite — sans photo
    let remaining = modules.slice(ROWS_PAGE1);
    while (remaining.length > 0) {
      globalPage++;
      const isLast = remaining.length <= ROWS_NEXT;
      const batch  = remaining.slice(0, ROWS_NEXT);
      remaining    = remaining.slice(ROWS_NEXT);
      const pn = document.createElement('div');
      pn.className = 'cat-page';
      pn.innerHTML = buildPage(
        p, company, logo, companyName, coeff, rounding, ranges,
        batch, isLast ? options : [],
        globalPage, totalPages, false
      );
      pagesEl.appendChild(pn);
    }
  });

  document.getElementById('loading').style.display = 'none';
  pagesEl.style.display = 'flex';
}

// ── Construction d'une page A4 ────────────────────────────────────────────────

function buildPage(p, company, logo, companyName, coeff, rounding, ranges, modules, options, pageNum, total, isFirstPage) {
  const descLines = (p.description || '')
    .split('\n')
    .map(l => l.replace(/^[-–—•]\s*/, '').trim())
    .filter(Boolean);

  return `
    ${renderHeader(p, logo, companyName, company, pageNum, total)}
    <div class="gold-rule"></div>

    <div class="cat-body">

      ${isFirstPage ? `
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
      </div>` : ''}

      <!-- MODULES -->
      ${modules.length ? `
      <div class="cat-modules">
        <div class="cat-section-title">Modules disponibles${!isFirstPage ? ' (suite)' : ''}</div>
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
