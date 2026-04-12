/**
 * etiquette.js — Rendu de l'étiquette magasin
 *
 * Reçoit les configurations de tuiles pré-calculées (prix de vente inclus)
 * et charge les données produit (photo, description, options) depuis la DB.
 */

'use strict';

// ── Query params ──────────────────────────────────────────────────────────────

const params    = new URLSearchParams(window.location.search);
const productId = params.get('productId') || '';
const tissuRef  = params.get('tissu')     || '';
const badgeText = params.get('badge')     || '';
const showQR    = params.get('showQR')    === '1';

/** Tuiles = [{title, price}, ...] — prix de vente déjà calculés */
let tileConfigs = [];
try {
  tileConfigs = JSON.parse(decodeURIComponent(params.get('configs') || '[]'));
} catch (e) {
  tileConfigs = [];
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => window.close());
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-pdf');
  btn.disabled = true;
  try {
    await window.api.print.savePDF(`Etiquette_${productId}.pdf`);
  } finally {
    btn.disabled = false;
  }
});

// ── Clés config entreprise ────────────────────────────────────────────────────

const CONFIG_KEYS = [
  'company_name', 'company_trade_name',
  'company_address', 'company_zip', 'company_city',
  'company_phone', 'company_email', 'company_website',
  'company_logo',
];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!productId) { showError('Aucun produit sélectionné.'); return; }

    const [prodRes, ...configResults] = await Promise.all([
      window.api.products.getById(productId),
      ...CONFIG_KEYS.map(k => window.api.app.getConfig(k)),
    ]);

    const product = prodRes?.ok ? prodRes.data : null;
    if (!product) { showError('Produit introuvable.'); return; }

    const company = {};
    CONFIG_KEYS.forEach((k, i) => {
      company[k] = (configResults[i]?.ok ? configResults[i].data : '') || '';
    });

    // Génération QR code (seulement si activé par l'utilisateur)
    let qrDataUrl = '';
    if (showQR) {
      const qrText = company.company_website
        ? `${company.company_website.replace(/\/$/, '')}/produits/${product.id}`
        : [product.name, product.collection, product.supplier_name].filter(Boolean).join(' — ');
      try {
        const qrRes = await window.api.products.generateQR(qrText);
        if (qrRes?.ok) qrDataUrl = qrRes.data;
      } catch (_) { /* QR facultatif */ }
    }

    render(product, company, qrDataUrl);
  } catch (e) {
    showError('Erreur : ' + e.message);
  }
});

function showError(msg) {
  document.getElementById('etiquette-page').innerHTML =
    `<div style="padding:40px;color:#c00;text-align:center">${escHtml(msg)}</div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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



/** Retourne un emoji selon le contenu du texte (option ou ligne de description) */
function getEmoji(text) {
  const t = (text || '').toLowerCase();
  if (/relax/.test(t))                                    return '⚡';
  if (/batter/.test(t))                                   return '🔋';
  if (/coutur|broderi|surpiq/.test(t))                    return '🎨';
  if (/pays|fabrication|fabriqué|made in|origine/.test(t)) return '🌍';
  if (/mémoire|memoire|memory/.test(t))                   return '🧠';
  return '';
}

// ── Rendu principal ───────────────────────────────────────────────────────────

function render(product, company, qrDataUrl = '') {
  // Lignes de description
  const descLines = (product.description || '')
    .split('\n')
    .map(l => l.replace(/^[-–—•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

  // 3 premières options du produit pour la section "Options disponibles"
  const options       = (product.options || []).slice(0, 3);
  const productCoeff  = parseFloat(product.purchase_coefficient) || 2.0;
  const rounding      = product.price_rounding || 'none';

  const companyName = company.company_trade_name || company.company_name || '';
  const logo = company.company_logo || '';

  document.getElementById('toolbar-title').textContent = `Étiquette — ${product.name}`;

  const page = document.getElementById('etiquette-page');
  page.innerHTML = `

    <!-- HEADER -->
    <div class="header">
      <div class="logo-wrap">
        ${logo
          ? `<img src="${logo}" alt="Logo">`
          : `<div class="logo-placeholder">Logo</div>`}
      </div>
      <div class="header-right">
        ${product.collection
          ? `<div class="collection-label">${escHtml(product.collection)}</div>`
          : ''}
        <div class="model-name">${escHtml(product.name)}</div>
        ${product.supplier_name
          ? `<div class="model-subtitle">${escHtml(product.supplier_name)}</div>`
          : ''}
      </div>
    </div>

    <!-- FILET OR -->
    <div class="gold-rule"></div>

    <!-- PHOTO -->
    <div class="photo-zone">
      ${product.photo
        ? `<img class="product-img" src="${product.photo}" alt="${escHtml(product.name)}">`
        : `<div class="photo-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Photo produit</span>
          </div>`}
      ${badgeText
        ? `<div class="photo-badge">${escHtml(badgeText)}</div>`
        : ''}
    </div>

    <!-- BANDEAU TISSU -->
    <div class="fabric-band">
      <div class="fabric-dot"></div>
      <div class="fabric-text">${tissuRef ? escHtml(tissuRef) : 'Tissu au choix dans notre sélection'}</div>
      <div class="fabric-dot"></div>
    </div>

    <!-- CONTENU -->
    <div class="content">

      ${tileConfigs.length ? `
      <div class="config-title">Configurations disponibles</div>
      <div class="price-grid">
        ${tileConfigs.map(t => renderTile(t)).join('')}
      </div>` : ''}

      <!-- BLOC BAS -->
      <div class="bottom-grid">
        <div class="descriptif">
          <div class="section-title">Description</div>
          ${descLines.length
            ? `<ul class="desc-list">${descLines.map(l => {
                const emoji = getEmoji(l);
                return `<li data-emoji="${emoji ? '1' : '0'}">${emoji ? `<span class="desc-emoji">${emoji}</span>` : ''}<span>${escHtml(l)}</span></li>`;
              }).join('')}</ul>`
            : `<p style="font-size:11px;color:#aaa">—</p>`}
        </div>
        <div class="options">
          <div class="section-title">Options disponibles</div>
          ${options.length
            ? options.map(o => renderOption(o, productCoeff, rounding)).join('')
            : `<p style="font-size:11px;color:#aaa">Aucune option</p>`}
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-left">
        ${escHtml(company.company_address || '')}
        ${company.company_zip || company.company_city
          ? `<br>${escHtml([company.company_zip, company.company_city].filter(Boolean).join(' '))}`
          : ''}
      </div>
      <div class="footer-center">${escHtml(companyName)}</div>
      <div class="footer-right" style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
        <div style="text-align:right">
          ${company.company_phone ? escHtml(company.company_phone) + '<br>' : ''}
          ${company.company_email ? escHtml(company.company_email) + '<br>' : ''}
          ${company.company_website ? escHtml(company.company_website) : ''}
        </div>
        ${qrDataUrl ? `<img src="${qrDataUrl}" class="footer-qr" alt="QR">` : ''}
      </div>
    </div>
  `;
}

// ── Tuile de configuration ────────────────────────────────────────────────────

/** Insère les emojis dans le titre d'une tuile segment par segment (séparés par " + ") */
function titleWithEmojis(title) {
  return title.split(' + ').map(part => {
    const emoji = getEmoji(part);
    return emoji ? `${emoji} ${escHtml(part)}` : escHtml(part);
  }).join(' + ');
}

// ── Schémas SVG ───────────────────────────────────────────────────────────────

/** Largeurs d'assise par nombre de places */
const SOFA_SEAT_W = { '1': 55, '1.5': 72, '2': 90, '2.5': 110, '3': 135, '3.5': 155, '4': 175 };

function svgSofa(places, hasRelax) {
  const sw = SOFA_SEAT_W[String(places)] || 110;
  const vw = sw + 20;
  const cx = Math.round(vw / 2);
  const label = places === '1' ? '1P' : `${places}P`;
  const relaxRow = hasRelax
    ? `<text x="${cx}" y="50" font-family="sans-serif" font-size="9" fill="white" text-anchor="middle">⚡</text>`
    : '';
  return `<svg viewBox="0 0 ${vw} 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="8" width="${sw}" height="50" rx="3" fill="#c8a96e" opacity="0.82"/>
    <rect x="10" y="8" width="${sw}" height="13" rx="3" fill="#1C1410" opacity="0.65"/>
    <rect x="4"  y="8" width="10"  height="50" rx="2" fill="#1C1410" opacity="0.45"/>
    <rect x="${sw}" y="8" width="10" height="50" rx="2" fill="#1C1410" opacity="0.45"/>
    <text x="${cx}" y="${hasRelax ? 40 : 38}" font-family="sans-serif" font-size="10" fill="white" text-anchor="middle" font-weight="700">${label}</text>
    ${relaxRow}
  </svg>`;
}

function svgMeridienne(hasRelax) {
  return `<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="8"  width="100" height="36" rx="3" fill="#c8a96e" opacity="0.82"/>
    <rect x="10" y="8"  width="100" height="11" rx="3" fill="#1C1410" opacity="0.65"/>
    <rect x="4"  y="8"  width="10"  height="36" rx="2" fill="#1C1410" opacity="0.45"/>
    <rect x="100" y="8" width="10"  height="54" rx="2" fill="#1C1410" opacity="0.45"/>
    <rect x="10" y="43" width="50"  height="18" rx="3" fill="#c8a96e" opacity="0.70"/>
    <rect x="4"  y="43" width="10"  height="18" rx="2" fill="#1C1410" opacity="0.30"/>
    <text x="55" y="30" font-family="sans-serif" font-size="9" fill="white" text-anchor="middle" font-weight="700">MÉR.</text>
    ${hasRelax ? `<text x="35" y="56" font-family="sans-serif" font-size="8" fill="white" text-anchor="middle">⚡</text>` : ''}
  </svg>`;
}

function svgAngle(hasRelax) {
  return `<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="8"  width="100" height="30" rx="3" fill="#c8a96e" opacity="0.82"/>
    <rect x="10" y="8"  width="100" height="10" rx="3" fill="#1C1410" opacity="0.65"/>
    <rect x="4"  y="8"  width="10"  height="30" rx="2" fill="#1C1410" opacity="0.45"/>
    <rect x="10" y="37" width="35"  height="25" rx="3" fill="#c8a96e" opacity="0.82"/>
    <rect x="4"  y="37" width="10"  height="25" rx="2" fill="#1C1410" opacity="0.45"/>
    <rect x="10" y="57" width="35"  height="5"  rx="2" fill="#1C1410" opacity="0.45"/>
    <text x="62" y="27" font-family="sans-serif" font-size="9" fill="white" text-anchor="middle" font-weight="700">ANGLE</text>
    ${hasRelax ? `<text x="27" y="52" font-family="sans-serif" font-size="8" fill="white" text-anchor="middle">⚡</text>` : ''}
  </svg>`;
}

function svgPouf() {
  return `<svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="50" height="50" rx="5" fill="#c8a96e" opacity="0.82"/>
    <text x="35" y="40" font-family="sans-serif" font-size="9" fill="white" text-anchor="middle" font-weight="700">POUF</text>
  </svg>`;
}

function svgGeneric() {
  return `<svg viewBox="0 0 110 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="8" width="90" height="50" rx="3" fill="#c8a96e" opacity="0.60"/>
    <rect x="10" y="8" width="90" height="13" rx="3" fill="#1C1410" opacity="0.45"/>
    <rect x="4"  y="8" width="10" height="50" rx="2" fill="#1C1410" opacity="0.35"/>
    <rect x="90" y="8" width="10" height="50" rx="2" fill="#1C1410" opacity="0.35"/>
  </svg>`;
}

/**
 * Génère un SVG schématique à partir du titre de la tuile.
 * Compatible tous fournisseurs : détection par regex sur le nom du module.
 * Le titre est de la forme "3 PLACES + 2 × RELAX" — le 1er segment = module de base.
 */
function getModuleSVG(title) {
  const t = (title || '').toLowerCase();
  const hasRelax = /relax/.test(t);

  // Formes spéciales
  if (/méridienne|meridienne|chaise.long/.test(t)) return svgMeridienne(hasRelax);
  if (/\bpouf\b/.test(t))                          return svgPouf();
  if (/\bangle\b|corner/.test(t))                  return svgAngle(hasRelax);

  // Nombre de places — accepte "3 places", "3p", "3pl", "2,5 places", "2.5p", etc.
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:places?|pl\.?|\bp\b)/);
  if (m) {
    const places = String(parseFloat(m[1].replace(',', '.')));
    return svgSofa(places, hasRelax);
  }
  if (/fauteuil/.test(t)) return svgSofa('1', hasRelax);

  // Fallback générique
  return svgGeneric();
}

function renderTile(tile) {
  const [intPart, decPart] = formatPrice(tile.price);
  // eco_participation est stocké en TTC (pas de TVA à appliquer)
  const ecoTTC = parseFloat(tile.ecoHT || 0);
  const ecoStr = ecoTTC > 0 ? ecoTTC.toFixed(2).replace('.', ',') : '';

  return `
    <div class="price-card">
      <div class="card-name">${titleWithEmojis(tile.title)}</div>
      ${tile.dimensions ? `<div class="card-dims">${escHtml(tile.dimensions)}</div>` : ''}
      <hr class="card-sep">
      <div class="price-row">
        <div class="version-label">À partir de</div>
        <div class="price-block">
          <div class="price-amount">
            <sup>€</sup>${intPart}${decPart !== '00' ? `<sup style="font-size:13px">${decPart}</sup>` : ''}
          </div>
          <div class="price-ttc">TTC</div>
        </div>
      </div>
      ${ecoStr ? `<div class="eco-line">dont éco-participation : ${ecoStr} € TTC</div>` : ''}
    </div>`;
}

// ── Option (section bas de l'étiquette — informatif) ─────────────────────────

function renderOption(opt, productCoeff, rounding) {
  const emoji    = getEmoji(opt.name) || getEmoji(opt.description || '');
  const priceHT  = parseFloat(opt.price) || 0;
  const optCoeff = (opt.coefficient != null) ? parseFloat(opt.coefficient) : productCoeff;
  const priceTTC = priceHT ? applyRounding(priceHT * optCoeff, rounding) : 0;
  const [int, dec] = priceTTC ? formatPrice(priceTTC) : ['', ''];

  return `
    <div class="option-item">
      <div class="option-name">${emoji ? `<span class="opt-emoji">${emoji}</span> ` : ''}${escHtml(opt.name)}</div>
      ${opt.description ? `<div class="option-desc">${escHtml(opt.description)}</div>` : ''}
      ${priceTTC ? `
      <div class="option-price-row">
        <div class="option-price"><sup>€</sup>${int}${dec !== '00' ? `<sup>${dec}</sup>` : ''}</div>
        <div class="option-unit">/assise</div>
      </div>` : ''}
    </div>`;
}
