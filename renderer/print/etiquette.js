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

    render(product, company);
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

function render(product, company) {
  // Lignes de description
  const descLines = (product.description || '')
    .split('\n')
    .map(l => l.replace(/^[-–—•]\s*/, '').trim())
    .filter(Boolean);

  // 3 premières options du produit pour la section "Options disponibles"
  const options = (product.options || []).slice(0, 3);

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
            ? options.map(o => renderOption(o)).join('')
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
      <div class="footer-right">
        ${company.company_phone ? escHtml(company.company_phone) + '<br>' : ''}
        ${company.company_email ? escHtml(company.company_email) + '<br>' : ''}
        ${company.company_website ? escHtml(company.company_website) : ''}
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

function renderTile(tile) {
  const [intPart, decPart] = formatPrice(tile.price);
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
    </div>`;
}

// ── Option (section bas de l'étiquette — informatif) ─────────────────────────

function renderOption(opt) {
  const emoji = getEmoji(opt.name) || getEmoji(opt.description || '');
  return `
    <div class="option-item">
      <div class="option-name">${emoji ? `<span class="opt-emoji">${emoji}</span> ` : ''}${escHtml(opt.name)}</div>
      ${opt.description ? `<div class="option-desc">${escHtml(opt.description)}</div>` : ''}
    </div>`;
}
