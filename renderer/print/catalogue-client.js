/**
 * catalogue-client.js — Catalogue PDF client
 * 2 produits par page A4, prix de vente TTC.
 */

'use strict';

// ── Params ────────────────────────────────────────────────────────────────────

const params     = new URLSearchParams(window.location.search);
const supplierId = params.get('supplierId') || '';
const productId  = params.get('productId')  || '';

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
    await window.api.print.savePDF('Catalogue client.pdf');
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

    // Filtre : actifs, non archivés, fournisseur et modèle si sélectionnés
    const products = allProdsRes.data
      .filter(p => {
        if (p.archived == 1) return false;
        if (p.active  == 0)  return false;
        if (supplierId && p.supplier_id !== supplierId) return false;
        if (productId  && p.id          !== productId)  return false;
        return true;
      })
      .sort((a, b) =>
        (a.collection || '').localeCompare(b.collection || '') ||
        a.name.localeCompare(b.name)
      );

    if (products.length === 0) {
      showError('Aucun produit actif trouvé' + (supplierId ? ' pour ce fournisseur' : '') + '.');
      return;
    }

    const supplierLabel = supplierId ? (products[0]?.supplier_name || '') : 'Tous fournisseurs';
    document.getElementById('toolbar-title').textContent = `Catalogue client — ${supplierLabel}`;
    document.getElementById('toolbar-info').textContent  = `${products.length} produit${products.length > 1 ? 's' : ''}`;

    renderCatalogue(products, company);

  } catch (e) {
    showError('Erreur inattendue : ' + e.message);
  }
});

function showError(msg) {
  document.getElementById('loading').innerHTML =
    `<div style="color:#c00;padding:40px;text-align:center">${escHtml(msg)}</div>`;
}

// ── Rendu principal ───────────────────────────────────────────────────────────

function renderCatalogue(products, company) {
  const pagesEl     = document.getElementById('catalogue-pages');
  const companyName = company.company_trade_name || company.company_name || '';
  const logo        = company.company_logo || '';

  pagesEl.innerHTML = '';

  // Grouper les produits par paires
  const pairs = [];
  for (let i = 0; i < products.length; i += 2) {
    pairs.push(products.slice(i, i + 2));
  }

  const totalPages = pairs.length;
  const dateStr    = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });

  pairs.forEach((pair, idx) => {
    const page = document.createElement('div');
    page.className = 'cat-page';
    page.innerHTML = buildPage(pair, company, logo, companyName, idx + 1, totalPages, dateStr);
    pagesEl.appendChild(page);
  });

  document.getElementById('loading').style.display = 'none';
  pagesEl.style.display = 'flex';
}

// ── Construction d'une page A4 ────────────────────────────────────────────────

function buildPage(pair, company, logo, companyName, pageNum, totalPages, dateStr) {
  const companyAddr    = [company.company_address, [company.company_zip, company.company_city].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
  const companyContact = [company.company_phone, company.company_email].filter(Boolean).join(' · ');

  return `
    <div class="page-header">
      <div class="ph-logo">
        ${logo ? `<img src="${logo}" alt="Logo">` : `<div class="ph-logo-ph">Logo</div>`}
      </div>
      <div class="ph-company">
        <div class="ph-company-name">${escHtml(companyName)}</div>
        ${companyContact ? `<div class="ph-company-sub">${escHtml(companyContact)}</div>` : ''}
      </div>
      <div class="ph-right">
        <div class="ph-title">Catalogue produits</div>
        <div class="ph-date">${dateStr}</div>
        <div class="ph-page">Page ${pageNum} / ${totalPages}</div>
      </div>
    </div>

    <div class="products-container">
      ${pair.map((p, i) => [
        i > 0 ? '<div class="card-divider"></div>' : '',
        buildProductCard(p),
      ].join('')).join('')}
    </div>

    <div class="page-footer">
      <div class="pf-left">${escHtml(companyAddr)}</div>
      <div class="pf-center">Prix TTC indicatifs — TVA incluse — Sous réserve de disponibilité</div>
      <div class="pf-right">${company.company_website ? escHtml(company.company_website) : ''}</div>
    </div>
  `;
}

// ── Card produit ──────────────────────────────────────────────────────────────

function buildProductCard(p) {
  const coeff   = parseFloat(p.purchase_coefficient) || 2;
  const mode    = p.price_rounding || 'none';
  const eco     = parseFloat(p.eco_participation) || 0;
  const ranges  = p.ranges  || [];
  const modules = p.modules || [];
  const options = p.options || [];

  const descText = (p.description || '')
    .split('\n')
    .map(l => l.replace(/^[-–—•]\s*/, '').trim())
    .filter(Boolean)
    .join(' · ');

  // Gammes avec base_price > 0 uniquement (les autres sont tarifées par modules)
  const pricedRanges = ranges.filter(r => parseFloat(r.base_price) > 0);

  return `
    <div class="product-card">

      <!-- PHOTO PLEINE LARGEUR -->
      <div class="pc-photo">
        ${p.photo
          ? `<img src="${p.photo}" alt="${escHtml(p.name)}">`
          : `<div class="pc-photo-ph">Photo produit</div>`}
      </div>

      <!-- NOM + COLLECTION -->
      <div class="pc-header">
        ${p.collection ? `<div class="pc-collection">${escHtml(p.collection)}</div>` : ''}
        <div class="pc-name">${escHtml(p.name)}</div>
      </div>

      <!-- DESCRIPTION + TARIFS + OPTIONS -->
      <div class="pc-info">
        ${descText ? `<div class="pc-desc">${escHtml(descText)}</div>` : ''}

        ${pricedRanges.length ? `
        <div class="pc-section">
          <div class="pc-section-title">Tarifs</div>
          <table class="ranges-table">
            ${pricedRanges.map(r => renderRangeRow(r, coeff, mode, eco)).join('')}
          </table>
        </div>` : ''}

        ${modules.length ? `
        <div class="pc-section">
          <div class="pc-section-title">Modules disponibles</div>
          <table class="modules-table">
            <thead>
              <tr>
                <th class="col-module">Module</th>
                ${ranges.map(r => `<th class="col-price">${escHtml(r.name)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${modules.map(m => renderModuleRow(m, ranges, coeff, mode, eco)).join('')}
            </tbody>
          </table>
        </div>` : ''}

        ${options.length ? `
        <div class="pc-section">
          <div class="pc-section-title">Options disponibles</div>
          <div class="options-list">
            ${options.map(o => renderOptionChip(o, coeff, mode)).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>
  `;
}

// ── Ligne de gamme (base_price > 0) ──────────────────────────────────────────

function renderRangeRow(r, coeff, mode, eco) {
  const base     = parseFloat(r.base_price);
  const rangeEco = parseFloat(r.eco_participation) || eco;
  const priceTTC = round2(applyRounding(base * coeff, mode) + rangeEco);
  return `
    <tr>
      <td class="range-name">${escHtml(r.name)}</td>
      <td class="range-dots"></td>
      <td class="range-price">${Number(priceTTC).toLocaleString('fr-FR')} €</td>
    </tr>`;
}

// ── Ligne de module ───────────────────────────────────────────────────────────

function renderModuleRow(m, ranges, coeff, mode, eco) {
  const mEco = parseFloat(m.eco_participation) || eco;
  const priceCells = ranges.map(r => {
    const pa = parseFloat((m.prices || {})[r.id]);
    if (!pa) return `<td class="col-price" style="color:#ccc">—</td>`;
    const priceTTC = round2(applyRounding(pa * coeff, mode) + mEco);
    return `<td class="col-price">${Number(priceTTC).toLocaleString('fr-FR')} €</td>`;
  });
  return `
    <tr>
      <td class="col-module">${escHtml(m.name)}${m.dimensions ? `<span class="dim"> · ${escHtml(m.dimensions)}</span>` : ''}</td>
      ${priceCells.join('')}
    </tr>`;
}

// ── Chip option ───────────────────────────────────────────────────────────────

function renderOptionChip(o, coeff, mode) {
  const priceHT  = parseFloat(o.price) || 0;
  const optCoeff = getOptionCoeff(o, coeff);
  const priceTTC = priceHT > 0 ? applyRounding(priceHT * optCoeff, mode) : 0;
  return `
    <div class="opt-chip">
      <span>${escHtml(o.name)}</span>
      ${priceTTC > 0 ? `<span class="opt-chip-price">+${Number(priceTTC).toLocaleString('fr-FR')} €</span>` : ''}
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
