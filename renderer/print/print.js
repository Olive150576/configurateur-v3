/**
 * print.js — Rendu du document dans la fenêtre d'aperçu
 * Données chargées via window.api.* (même preload que le renderer principal)
 */

'use strict';

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const docId  = params.get('docId');

  if (!docId) {
    showError('Aucun document spécifié.');
    return;
  }

  try {
    const [docRes, logoRes, vatRes, company] = await Promise.all([
      window.api.documents.getById(docId),
      window.api.app.getLogo(),
      window.api.app.getConfig('vat_rate'),
      loadCompanyConfig(),
    ]);

    if (!docRes.ok || !docRes.data) {
      showError('Document introuvable.');
      return;
    }

    const doc     = docRes.data;
    const logo    = (logoRes.ok && logoRes.data) ? logoRes.data : null;
    const vatRate = parseFloat(vatRes?.data ?? 20) || 20;

    renderDocument(doc, company, logo, vatRate);
    setupToolbar(doc);

  } catch (e) {
    showError('Erreur de chargement : ' + e.message);
  }
});

async function loadCompanyConfig() {
  const keys = [
    'company_name', 'company_trade_name', 'company_address', 'company_city', 'company_zip',
    'company_phone', 'company_email', 'company_siret', 'company_ape', 'company_capital', 'company_vat',
    'company_legal_form', 'company_rcs_city',
    'quote_validity_days', 'delivery_weeks', 'payment_modes',
  ];
  const results = await Promise.all(keys.map(k => window.api.app.getConfig(k)));
  const obj = {};
  keys.forEach((k, i) => { obj[k] = (results[i].ok ? results[i].data : '') || ''; });
  return obj;
}

// ==================== TOOLBAR ====================

function setupToolbar(doc) {
  const typeLabel  = docTypeLabel(doc.type);
  const numLabel   = doc.number || 'brouillon';
  const winTitle   = `${typeLabel} — ${numLabel}`;
  const fileName   = `${typeLabel.replace(/\s/g,'-')}-${numLabel}.pdf`;

  document.getElementById('toolbar-title').textContent = winTitle;

  document.getElementById('btn-save-pdf').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-pdf');
    btn.disabled    = true;
    btn.textContent = '⏳ Génération…';
    try {
      await window.api.print.savePDF(fileName);
    } finally {
      btn.disabled    = false;
      btn.textContent = '📄 Sauvegarder PDF';
    }
  });

  document.getElementById('btn-email').addEventListener('click', async () => {
    const btn = document.getElementById('btn-email');
    btn.disabled    = true;
    btn.textContent = '⏳ Préparation…';
    try {
      const client  = doc.client_snapshot ?? {};
      const subject = `${typeLabel} ${numLabel}`;
      const body    = `Bonjour${client.name ? ' ' + client.name : ''},\n\nVeuillez trouver ci-joint votre ${typeLabel.toLowerCase()} n° ${numLabel}.\n\nCordialement`;
      await window.api.print.openEmail({
        defaultName:  fileName,
        clientEmail:  client.email ?? '',
        subject,
        body,
      });
    } finally {
      btn.disabled    = false;
      btn.textContent = '✉ Envoyer';
    }
  });

  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-close').addEventListener('click', () => window.close());
}

// ==================== RENDER ====================

/**
 * Calcule le TTC brut réel en sommant les TTC par article.
 * Plus précis que subtotalHT × (1+tva) car préserve les arrondis par ligne.
 * - Modules : unit_price stocké en TTC (avec éco)
 * - Options  : price stocké en TTC
 * - Ligne simple (sans modules) : unit_price en HT → converti en TTC
 * - Livraison : unit_price en HT → converti en TTC
 */
function computeTrueTTC(lines, vatRate) {
  let sum = 0;
  lines.forEach(line => {
    if (line.is_eco) return;
    const mods = line.product_config?.modules ?? [];
    const opts = line.product_config?.options ?? [];
    const qty  = line.qty || 1;
    if (line.is_delivery) {
      sum += r2(line.unit_price * (1 + vatRate / 100));
      return;
    }
    if (mods.length > 0) {
      mods.forEach(m => { sum += r2((m.unit_price ?? 0) * (m.qty || 1)); });
      opts.forEach(o  => { sum += r2((o.price      ?? 0) * (o.qty || 1)); });
    } else {
      sum += r2(line.unit_price * qty * (1 + vatRate / 100));
    }
  });
  return r2(sum);
}

function renderDocument(doc, company, logo, vatRate) {
  const lines      = doc.product_snapshot?.lines ?? [];
  const client     = doc.client_snapshot ?? {};
  const subtotalHT = doc.subtotal ?? 0;

  // TTC brut recalculé depuis les articles (évite l'écart d'arrondi HT→TTC)
  const computedTTC   = computeTrueTTC(lines, vatRate);
  const totalTTC_brut = computedTTC > 0 ? computedTTC : r2(subtotalHT * (1 + vatRate / 100));
  const vatAmt        = r2(totalTTC_brut - subtotalHT);

  // Remise et net recalculés sur la base TTC correcte (cohérence visuelle)
  const discPct       = doc.discount_percent ?? 0;
  const storedDisc    = doc.discount_amount  ?? 0;
  const discAmt       = storedDisc > 0
    ? (discPct > 0 ? r2(totalTTC_brut * discPct / 100) : Math.min(storedDisc, totalTTC_brut))
    : 0;
  const netTTC        = discAmt > 0 ? r2(totalTTC_brut - discAmt) : (doc.total ?? 0);

  const info = extractHeaderInfo(lines);

  const page = document.getElementById('doc-page');
  page.innerHTML = `
    ${renderHeader(doc, company, logo, info)}
    <hr class="sep">
    ${renderCompanyClient(company, client)}
    ${doc.notes ? renderOptionsBar(doc.notes) : ''}
    <div class="lines">
      ${renderLinesTable(lines, vatRate)}
    </div>
    ${renderCompositionAndPhoto(doc)}
    ${renderTotals(doc, subtotalHT, vatAmt, totalTTC_brut, netTTC, vatRate, company, lines)}
    ${renderFooter(company, doc.type)}
  `;
}

// ==================== COMPOSITION ====================
// Fonctions de génération SVG — identiques à compositions.js (vue de dessus, 1px=1cm)

(function() {
  const ARM    = 10;
  const BH     = 12;
  const S_FILL = '#c8a96e';
  const DARK   = '#1C1410';

  function _lbl(cx, cy, n, w, d, hasRelax) {
    const fs  = Math.max(8, Math.min(13, Math.round(w * 0.09)));
    const fs2 = Math.max(7, fs - 1);
    const relax = hasRelax
      ? `<text x="${cx}" y="${cy - fs - 3}" font-family="sans-serif" font-size="${fs + 2}" text-anchor="middle">⚡</text>` : '';
    return `${relax}
      <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">${n}P · ${w}cm</text>
      <text x="${cx}" y="${cy + fs2 + 2}" font-family="sans-serif" font-size="${fs2}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${w}×${d}cm</text>`;
  }

  function _sofaFull(n, w, d, r) {
    const sw = w - ARM * 2;
    return `<rect x="${ARM}" y="0" width="${sw}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="${ARM}" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="0" y="0" width="${ARM}" height="${d}" rx="2" fill="${DARK}" opacity="0.50"/>
      <rect x="${w - ARM}" y="0" width="${ARM}" height="${d}" rx="2" fill="${DARK}" opacity="0.50"/>
      ${_lbl(w / 2, d * 0.55, n, w, d, r)}`;
  }
  function _batardLeft(n, w, d, r) {
    const sw = w - ARM;
    return `<rect x="${ARM}" y="0" width="${sw}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="${ARM}" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="0" y="0" width="${ARM}" height="${d}" rx="2" fill="${DARK}" opacity="0.50"/>
      ${_lbl(ARM + sw / 2, d * 0.55, n, w, d, r)}`;
  }
  function _batardRight(n, w, d, r) {
    const sw = w - ARM;
    return `<rect x="0" y="0" width="${sw}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="0" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="${sw}" y="0" width="${ARM}" height="${d}" rx="2" fill="${DARK}" opacity="0.50"/>
      ${_lbl(sw / 2, d * 0.55, n, w, d, r)}`;
  }
  function _sansAccoudoir(n, w, d, r) {
    return `<rect x="0" y="0" width="${w}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="0" y="0" width="${w}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      ${_lbl(w / 2, d * 0.55, n, w, d, r)}`;
  }
  function _angleLeft(w, d) {
    const S = Math.min(w, d);
    const fs = Math.max(8, Math.round(S * 0.14));
    return `<rect x="0" y="0" width="${S}" height="${S}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="0" y="0" width="${S}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="0" y="0" width="${BH}" height="${S}" rx="3" fill="${DARK}" opacity="0.65"/>
      <text x="${S * 0.6}" y="${S * 0.52}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">∟G</text>
      <text x="${S * 0.6}" y="${S * 0.52 + fs + 2}" font-family="sans-serif" font-size="${Math.max(7, Math.round(S * 0.11))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${S}×${S}cm</text>`;
  }
  function _angleRight(w, d) {
    const S = Math.min(w, d);
    const fs = Math.max(8, Math.round(S * 0.14));
    return `<rect x="0" y="0" width="${S}" height="${S}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="0" y="0" width="${S}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="${S - BH}" y="0" width="${BH}" height="${S}" rx="3" fill="${DARK}" opacity="0.65"/>
      <text x="${S * 0.4}" y="${S * 0.52}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">∟D</text>
      <text x="${S * 0.4}" y="${S * 0.52 + fs + 2}" font-family="sans-serif" font-size="${Math.max(7, Math.round(S * 0.11))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${S}×${S}cm</text>`;
  }
  function _merienneRight(w, d) {
    const sw = w - ARM;
    const fs = Math.max(8, Math.round(w * 0.11));
    return `<rect x="0" y="0" width="${sw}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="0" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <rect x="${sw}" y="0" width="${ARM}" height="${w}" rx="2" fill="${DARK}" opacity="0.50"/>
      <text x="${sw / 2}" y="${d * 0.55}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">MÉR.D</text>
      <text x="${sw / 2}" y="${d * 0.55 + fs + 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(w * 0.09))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${d}cm</text>`;
  }
  function _merienneLeft(w, d) {
    const sw = w - ARM;
    const fs = Math.max(8, Math.round(w * 0.11));
    return `<rect x="0" y="0" width="${ARM}" height="${w}" rx="2" fill="${DARK}" opacity="0.50"/>
      <rect x="${ARM}" y="0" width="${sw}" height="${d}" rx="3" fill="${S_FILL}" opacity="0.85"/>
      <rect x="${ARM}" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}" opacity="0.65"/>
      <text x="${ARM + sw / 2}" y="${d * 0.55}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">MÉR.G</text>
      <text x="${ARM + sw / 2}" y="${d * 0.55 + fs + 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(w * 0.09))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${d}cm</text>`;
  }
  function _pouf(w, d) {
    const fs = Math.max(8, Math.round(w * 0.12));
    return `<rect x="2" y="2" width="${w - 4}" height="${d - 4}" rx="8" fill="${S_FILL}" opacity="0.85"/>
      <text x="${w / 2}" y="${d * 0.48}" font-family="sans-serif" font-size="${fs}" fill="white" text-anchor="middle" font-weight="700">POUF</text>
      <text x="${w / 2}" y="${d * 0.48 + fs + 2}" font-family="sans-serif" font-size="${Math.max(7, fs - 1)}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${w}×${d}cm</text>`;
  }
  function _tableRonde(w, d) {
    const r = Math.round(Math.min(w, d) / 2) - 2;
    const cx = w / 2, cy = d / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.round(r * 0.7)}" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
      <text x="${cx}" y="${cy - 4}" font-family="sans-serif" font-size="${Math.max(7, Math.round(r * 0.2))}" fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
      <text x="${cx}" y="${cy + Math.max(7, Math.round(r * 0.2)) + 2}" font-family="sans-serif" font-size="${Math.max(6, Math.round(r * 0.17))}" fill="#5a3e10" text-anchor="middle">⌀${w}cm</text>`;
  }
  function _tableCarree(w, d) {
    return `<rect x="2" y="2" width="${w - 4}" height="${d - 4}" rx="5" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
      <rect x="8" y="8" width="${w - 16}" height="${d - 16}" rx="3" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
      <text x="${w / 2}" y="${d / 2 - 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(w * 0.1))}" fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
      <text x="${w / 2}" y="${d / 2 + Math.max(7, Math.round(w * 0.1)) + 1}" font-family="sans-serif" font-size="${Math.max(6, Math.round(w * 0.09))}" fill="#5a3e10" text-anchor="middle">${w}×${d}cm</text>`;
  }
  function _tableRect(w, d) {
    return `<rect x="2" y="2" width="${w - 4}" height="${d - 4}" rx="5" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
      <rect x="8" y="8" width="${w - 16}" height="${d - 16}" rx="3" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
      <text x="${w / 2}" y="${d / 2 - 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(d * 0.14))}" fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
      <text x="${w / 2}" y="${d / 2 + Math.max(7, Math.round(d * 0.14)) + 1}" font-family="sans-serif" font-size="${Math.max(6, Math.round(d * 0.12))}" fill="#5a3e10" text-anchor="middle">${w}×${d}cm</text>`;
  }

  function _innerSvg(mod) {
    const { type, places: n, w_cm: w, d_cm: d, hasRelax: r } = mod;
    switch (type) {
      case 'sofa-full':           return _sofaFull(n, w, d, r);
      case 'batard-left':         return _batardLeft(n, w, d, r);
      case 'batard-right':        return _batardRight(n, w, d, r);
      case 'sans-accoudoir':      return _sansAccoudoir(n, w, d, r);
      case 'angle-left':          return _angleLeft(w, d);
      case 'angle-right':         return _angleRight(w, d);
      case 'meridienne-left':     return _merienneLeft(w, d);
      case 'meridienne-right':    return _merienneRight(w, d);
      case 'pouf':                return _pouf(w, d);
      case 'table-ronde':         return _tableRonde(w, d);
      case 'table-carree':        return _tableCarree(w, d);
      case 'table-rectangulaire': return _tableRect(w, d);
      default: return '';
    }
  }

  /**
   * Reconstruit un SVG fidèle au canvas depuis le tableau de modules JSON.
   * Utilise des <svg> imbriqués (SVG 1.1 nested) pour positionner et redimensionner chaque module.
   */
  window._buildCompositionSVG = function(modulesJson) {
    let mods;
    try { mods = JSON.parse(modulesJson || '[]'); } catch { return ''; }
    if (!mods.length) return '';

    const PAD = 15;
    const minX = Math.min(...mods.map(m => m.x)) - PAD;
    const minY = Math.min(...mods.map(m => m.y)) - PAD;
    const maxX = Math.max(...mods.map(m => m.x + m.w_cm)) + PAD;
    const maxY = Math.max(...mods.map(m => m.y + m.d_cm)) + PAD;
    const vw = maxX - minX;
    const vh = maxY - minY;

    const pieces = mods.map(m => {
      const tx = m.x - minX;
      const ty = m.y - minY;
      const cx = tx + m.w_cm / 2;
      const cy = ty + m.d_cm / 2;
      const rot = m.rotation || 0;
      const inner = _innerSvg(m);
      return `<g transform="rotate(${rot},${cx},${cy})">
        <svg x="${tx}" y="${ty}" width="${m.w_cm}" height="${m.d_cm}" viewBox="0 0 ${m.w_cm} ${m.d_cm}" overflow="visible">
          ${inner}
        </svg>
      </g>`;
    }).join('\n');

    return `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
      <rect width="${vw}" height="${vh}" fill="#f8fafc" rx="4"/>
      ${pieces}
    </svg>`;
  };
})();

/**
 * Affiche la composition et la photo dans un seul cadre côte à côte.
 * Si seulement l'un des deux est présent, il prend toute la largeur.
 */
function renderCompositionAndPhoto(doc) {
  const hasCompo = !!(doc.composition_svg || doc.composition_json);
  const hasPhoto = !!doc.product_photo;
  if (!hasCompo && !hasPhoto) return '';

  // SVG composition
  let svgHtml = '';
  if (hasCompo) {
    if (doc.composition_json && typeof window._buildCompositionSVG === 'function') {
      svgHtml = window._buildCompositionSVG(doc.composition_json);
    }
    if (!svgHtml && doc.composition_svg) {
      svgHtml = doc.composition_svg.replace(/<svg/, '<svg style="width:100%;display:block"');
    }
  }

  const compoBlock = svgHtml ? `
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:6px">
        Plan de composition
      </div>
      <div style="width:100%;max-width:220px;background:#f8fafc;border-radius:5px;padding:6px;box-sizing:border-box">
        ${svgHtml}
      </div>
    </div>
  ` : '';

  const photoBlock = hasPhoto ? `
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:6px">
        Photo
      </div>
      <img src="${doc.product_photo}"
        style="max-height:160px;max-width:100%;object-fit:contain;border-radius:5px;display:block">
    </div>
  ` : '';

  return `
    <div style="
      margin: 10px 0;
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      page-break-inside: avoid;
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: center;
    ">
      ${compoBlock}
      ${photoBlock}
    </div>
  `;
}

// ==================== HEADER ====================

function extractHeaderInfo(lines) {
  if (!lines.length) return { productName: '', rangeName: '', supplierName: '' };

  const parseName  = d => (d?.split(' — ')[0] ?? '').trim();
  const parseRange = d => (d?.split(' — ')[1] ?? '').trim();

  const firstName  = parseName(lines[0].designation);
  const firstRange = parseRange(lines[0].designation);

  const allSameName  = lines.every(l => parseName(l.designation)  === firstName);
  const allSameRange = lines.every(l => parseRange(l.designation) === firstRange);

  const supplierName = lines[0].product_config?.supplier_name ?? '';

  return {
    productName:  allSameName  ? firstName  : '',
    rangeName:    allSameRange ? firstRange : '',
    supplierName,
  };
}

function renderHeader(doc, company, logo, info) {
  const dateStr = formatDateFr(doc.created_at);
  const typeStr = docTypeLabel(doc.type).toUpperCase();

  const leftHtml = `
    <div class="hdr-left">
      <div class="hdr-product-name">${
        info.productName
          ? esc(info.productName)
          : esc(company.company_name || 'Document')
      }</div>
      ${info.supplierName
        ? `<div class="hdr-collection">Collection ${esc(info.supplierName)}</div>`
        : ''}
      ${info.rangeName
        ? `<div class="hdr-badge">${esc(info.rangeName)}</div>`
        : ''}
      <div class="hdr-doc-meta">
        <div class="hdr-doc-number">N° ${esc(doc.number || '—')}</div>
        <div class="hdr-doc-date">Le ${dateStr}</div>
      </div>
    </div>
  `;

  const centerHtml = `
    <div class="hdr-center">
      <div class="doc-type-inner">${typeStr}</div>
    </div>
  `;

  const rightHtml = `
    <div class="hdr-right">
      ${logo
        ? `<img class="hdr-logo" src="${logo}" alt="Logo">`
        : `<div class="hdr-company-name">${esc(company.company_trade_name || company.company_name || '')}</div>`}
    </div>
  `;

  return `<div class="doc-header">${leftHtml}${centerHtml}${rightHtml}</div>`;
}

// ==================== COMPANY + CLIENT (two-column) ====================

function renderCompanyClient(company, client) {
  const legalLine = [company.company_legal_form, company.company_capital ? 'Capital ' + company.company_capital : ''].filter(Boolean).join(' · ');

  const companyHtml = `
    <div class="col-company">
      <span class="col-label">Vendeur</span>
      <div class="col-company-name">${esc(company.company_trade_name || company.company_name || '')}</div>
      ${legalLine ? `<div class="col-company-detail">${esc(legalLine)}</div>` : ''}
      ${company.company_address ? `<div class="col-company-detail">${esc(company.company_address)}</div>` : ''}
      ${(company.company_zip || company.company_city)
        ? `<div class="col-company-detail">${esc([company.company_zip, company.company_city].filter(Boolean).join(' '))}</div>`
        : ''}
      ${company.company_phone ? `<div class="col-company-detail">${esc(company.company_phone)}</div>` : ''}
      ${company.company_email ? `<div class="col-company-detail">${esc(company.company_email)}</div>` : ''}
    </div>
  `;

  if (!client.name && !client.company) {
    return `<div class="company-client-row">${companyHtml}</div>`;
  }

  const companyHeader = client.company || '';
  const contactName   = client.name    || '';
  const headerLine    = companyHeader ? companyHeader.toUpperCase() : contactName.toUpperCase();
  const subLine       = companyHeader ? contactName : '';

  const clientHtml = `
    <div class="col-client">
      <span class="col-label">Client</span>
      <div class="col-client-header">${esc(headerLine)}</div>
      ${subLine ? `<div class="col-client-name">${esc(subLine)}</div>` : ''}
      ${client.address ? `<div class="col-client-detail">${esc(client.address)}</div>` : ''}
      ${(client.zip || client.city) ? `<div class="col-client-detail">${esc([client.zip, client.city].filter(Boolean).join(' '))}</div>` : ''}
      ${client.phone ? `<div class="col-client-detail">${esc(client.phone)}</div>` : ''}
      ${client.email ? `<div class="col-client-detail">${esc(client.email)}</div>` : ''}
      ${client.notes ? `<div class="col-client-detail" style="font-style:italic">${esc(client.notes)}</div>` : ''}
    </div>
  `;

  return `<div class="company-client-row">${companyHtml}${clientHtml}</div>`;
}

// ==================== OPTIONS BAR ====================

function renderOptionsBar(notes) {
  return `
    <div class="options-bar">
      <span>
        <span class="opt-item-label">Notes</span>
        <span class="opt-item-value">${esc(notes)}</span>
      </span>
    </div>
  `;
}

// ==================== LINE ITEMS TABLE ====================

function renderLinesTable(lines, vatRate) {
  if (!lines.length) return '';

  const rows = [];
  let idx = 0;

  lines.forEach((line, lineIdx) => {
    const modules = line.product_config?.modules ?? [];
    const options = line.product_config?.options ?? [];

    // Ligne livraison
    if (line.is_delivery) {
      rows.push(renderRow(idx++, '🚚 Livraison', 1, line.unit_price ?? 0, vatRate));
      return;
    }

    // Anciennes lignes éco séparées — ignorées (éco désormais incluse dans le prix)
    if (line.is_eco) return;

    const colorRef    = line.color_ref || '';
    const productDesc = line.product_config?.product_description || '';
    const ecoHT       = line.product_config?.eco_ht ?? 0;
    const lineQty     = line.qty || 1;

    // En-tête de groupe (désignation produit + quantité)
    if (modules.length > 0 || options.length > 0) {
      const desig = (line.designation || '').replace(' — ', ' · ');
      rows.push(renderGroupHeader(desig, lineQty, ecoHT, lineIdx === 0));
    }

    if (modules.length > 0) {
      // Un article = un module → une ligne par module
      // mod.unit_price est stocké en TTC (PA × coeff + éco) → convertir en HT pour renderRow
      modules.forEach((mod) => {
        const modDesc   = [mod.dimensions, mod.description].filter(Boolean).join(' — ');
        const modUnitHT = r2((mod.unit_price ?? 0) / (1 + vatRate / 100));
        const modEco    = mod.eco_participation || 0;
        rows.push(renderRow(idx++, mod.name, mod.qty || 1, modUnitHT, vatRate, false, colorRef, modDesc, '', modEco));
      });
      // Options éventuelles (supplément) — opt.price aussi en TTC
      options.forEach(opt => {
        const optUnitHT = r2((opt.price ?? 0) / (1 + vatRate / 100));
        rows.push(renderRow(idx++, opt.name, opt.qty || 1, optUnitHT, vatRate, true, '', opt.description || '', ''));
      });
    } else {
      // Pas de modules → la ligne entière
      const desig    = (line.designation || '').replace(' — ', ' · ');
      const rangeDim = line.product_config?.range_dimensions || '';
      rows.push(renderRow(idx++, desig, lineQty, line.unit_price ?? 0, vatRate, false, colorRef, rangeDim, productDesc, ecoHT));
    }
  });

  return `
    <table class="lines-table">
      <thead>
        <tr>
          <th class="th-num">N°</th>
          <th>Désignation</th>
          <th class="th-qty">Qté</th>
          <th class="th-pu">PU HT</th>
          <th class="th-tva">TVA</th>
          <th class="th-total">Total TTC</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
}

function renderGroupHeader(designation, qty, ecoHT = 0, isFirst = false) {
  return `
    <tr class="group-header-row${isFirst ? ' first' : ''}">
      <td colspan="6">
        <div class="group-header-inner">
          <span class="group-header-name">${esc(designation)}</span>
          ${qty > 1 ? `<span class="group-header-qty">× ${qty}</span>` : ''}
          ${ecoHT > 0 ? `<span style="font-size:9px;color:#15803d;font-style:italic;margin-left:6px">♻ dont éco-participation ${formatPrice(ecoHT)} €</span>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderRow(idx, name, qty, unitHT, vatRate, isOption = false, colorRef = '', modDescription = '', productDescription = '', ecoHT = 0) {
  const num     = String(idx + 1).padStart(2, '0');
  const lineTTC = r2(unitHT * qty * (1 + vatRate / 100));
  const emoji   = getEmoji(name) || getEmoji(modDescription);
  const label   = isOption
    ? `${emoji ? emoji + ' ' : ''}+ ${name}`
    : `${emoji ? emoji + ' ' : ''}${name}`;

  return `
    <tr>
      <td class="td-num">${num}</td>
      <td class="td-desig">
        <div class="desig-main${isOption ? ' desig-option' : ''}">${esc(label)}</div>
        ${modDescription ? `<div class="desig-detail">${esc(modDescription)}</div>` : ''}
        ${productDescription ? `<div class="desig-product-desc">${esc(productDescription)}</div>` : ''}
        ${ecoHT > 0 ? `<div style="font-size:9px;color:#15803d;font-style:italic">♻ dont éco-participation ${formatPrice(ecoHT)} €</div>` : ''}
        ${colorRef ? `<div class="desig-option" style="font-style:normal;color:var(--gold)">Réf. ${esc(colorRef)}</div>` : ''}
      </td>
      <td class="td-qty">${qty}</td>
      <td class="td-pu">${formatAmount(unitHT)}<span class="td-pu-label">€ HT</span></td>
      <td class="td-tva">${vatRate}%</td>
      <td class="td-total">
        <span class="td-total-ttc">${formatAmount(lineTTC)}</span>
        <span class="td-total-label">€ TTC</span>
      </td>
    </tr>
  `;
}

// ==================== TOTALS ====================

function renderTotals(doc, subtotalHT, vatAmt, totalTTC_brut, netTTC, vatRate, company = {}, lines = []) {
  const docType = doc.type;
  const discPct    = doc.discount_percent ?? 0;
  // discAmt et regularTTC dérivés des valeurs passées (déjà recalculées depuis les articles)
  const discAmt    = r2(totalTTC_brut - netTTC);
  const discLabel  = (discPct > 0 && Number.isInteger(discPct)) ? `Remise ${discPct}%` : 'Remise';
  const regularTTC = totalTTC_brut;

  // Acompte : utiliser deposit_amount directement (TTC), sinon recalculer sur netTTC
  const depositTTC = doc.deposit_amount > 0
    ? r2(doc.deposit_amount)
    : (doc.deposit_percent > 0 ? r2(netTTC * doc.deposit_percent / 100) : 0);
  const balanceTTC = depositTTC > 0 ? r2(netTTC - depositTTC) : 0;
  const depPct     = doc.deposit_percent ?? 0;
  const depLabel   = (depPct > 0 && Number.isInteger(depPct)) ? `Acompte ${depPct}%` : 'Acompte';

  return `
    <div class="total-section">
      <div class="total-ht-rows">
        <div class="total-ht-row">
          <span>Sous-total HT</span>
          <span>${formatPrice(subtotalHT)} €</span>
        </div>
        <div class="total-ht-row">
          <span>TVA ${vatRate}%</span>
          <span>${formatPrice(vatAmt)} €</span>
        </div>
        ${discAmt > 0 ? `
          <div class="total-ht-row">
            <span>Total TTC</span>
            <span>${formatPrice(regularTTC)} €</span>
          </div>
          <div class="total-ht-row">
            <span>${discLabel}</span>
            <span>— ${formatPrice(discAmt)} €</span>
          </div>
        ` : ''}
      </div>

      <div class="total-main-row">
        <span class="total-main-label">${discAmt > 0 ? 'Net TTC' : 'Total TTC'}</span>
        <div class="total-main-price">
          <span class="total-sym">€</span>
          <span class="total-amt">${formatAmount(netTTC)}</span>
          <span class="total-suffix">TTC</span>
        </div>
      </div>

      ${depositTTC > 0 ? `
        <div class="deposit-rows">
          <div class="deposit-row">
            <span>${depLabel}</span>
            <span>${formatPrice(depositTTC)} € TTC</span>
          </div>
          <div class="deposit-row deposit-row-balance">
            <span class="balance-label">Solde à régler</span>
            <span class="balance-amount">${formatAmount(balanceTTC)} € TTC</span>
          </div>
        </div>
      ` : ''}

      <div class="disclaimer-sig-row">
        <div class="disclaimer">
          <div style="margin-bottom:3px"><strong>Conditions</strong></div>
          ${company && company.quote_validity_days && docType !== 'commande'
            ? `<div>Devis valable <strong>${esc(company.quote_validity_days)} jours</strong> à compter de sa date d'émission.</div>`
            : ''}
          ${(() => {
              const supplierWeeks = lines[0]?.product_config?.supplier_delivery_weeks;
              const raw   = supplierWeeks || (company && company.delivery_weeks) || '';
              const weeks = raw.replace(/\s*semaines?\s*$/i, '').trim();
              return weeks
                ? `<div>Délai de livraison estimé : <strong>${esc(weeks)} semaines</strong> après versement de l'acompte et confirmation de commande.</div>`
                : '';
            })()}
          ${company && company.payment_modes
            ? `<div>Modes de règlement : ${esc(company.payment_modes)}.</div>`
            : ''}
          <div style="margin-top:3px">Dimensions indicatives ± 2–3 cm · Sous réserve de disponibilité des coloris.</div>
        </div>
        <div class="signature-block">
          <div class="signature-label">Bon pour accord</div>
          <div class="signature-sublabel">Date et signature du client</div>
          <div class="signature-line"></div>
          <div class="signature-name">&nbsp;</div>
        </div>
      </div>
    </div>
  `;
}

// ==================== FOOTER ====================

function renderFooter(company, docType) {
  const contactParts = [
    company.company_trade_name || company.company_name,
    company.company_phone,
    company.company_email,
  ].filter(Boolean);

  const siren      = company.company_siret ? company.company_siret.replace(/\s/g,'').substring(0,9) : '';
  const rcsLine    = [company.company_rcs_city, siren].filter(Boolean).join(' ');

  const legalParts = [
    company.company_siret   ? `SIRET ${company.company_siret}`         : '',
    company.company_ape     ? `APE ${company.company_ape}`             : '',
    company.company_vat     ? `TVA intra. ${company.company_vat}`      : '',
    rcsLine                 ? `RCS ${rcsLine}`                         : '',
    company.company_capital ? `Capital ${company.company_capital}`     : '',
  ].filter(Boolean);

  return `
    <div class="doc-footer">
      <div class="footer-legal-mentions">
        <strong>Mentions légales —</strong>
        Réserve de propriété : le transfert de propriété n'intervient qu'après paiement intégral du prix.
        Garantie légale de conformité (art. L217-1 et s. C.conso., 2 ans) et des vices cachés (art. 1641 et s. C.civ.).
        ${docType === 'commande' ? `Ce bon de commande vaut contrat de vente dès acceptation et versement de l'acompte.` : ''}
      </div>
      <div class="footer-contact-centered">
        ${contactParts.map(esc).join(' · ')}
        ${legalParts.length
          ? `<br>${legalParts.map(esc).join(' · ')}`
          : ''}
      </div>
    </div>
  `;
}

// ==================== HELPERS ====================

function r2(n) { return round2(n); }

function getEmoji(text) {
  const t = (text || '').toLowerCase();
  if (/relax/.test(t) && !/sans\s*relax/.test(t))          return '⚡';
  if (/batter/.test(t))                                    return '🔋';
  if (/coutur|broderi|surpiq/.test(t))                     return '🎨';
  if (/pays|fabrication|fabriqué|made in|origine/.test(t)) return '🌍';
  if (/mémoire|memoire|memory/.test(t))                    return '🧠';
  return '';
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateFr(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function docTypeLabel(type) {
  const map = { devis: 'Devis', offre: 'Offre commerciale', commande: 'Commande' };
  return map[type] ?? (type || 'Document');
}

function formatAmount(n) {
  return Math.round(n || 0).toLocaleString('fr-FR');
}

function formatPrice(n) {
  return Math.round(n || 0).toLocaleString('fr-FR');
}

function showError(msg) {
  const page = document.getElementById('doc-page');
  if (page) page.innerHTML = `<div style="padding:40px;color:#c00;font-size:14px">⚠ ${msg}</div>`;
}
