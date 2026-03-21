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
    'company_name', 'company_address', 'company_city', 'company_zip',
    'company_phone', 'company_email', 'company_siret', 'company_vat',
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

  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-close').addEventListener('click', () => window.close());
}

// ==================== RENDER ====================

function renderDocument(doc, company, logo, vatRate) {
  const lines    = doc.product_snapshot?.lines ?? [];
  const client   = doc.client_snapshot ?? {};
  const totalHT  = doc.total ?? 0;
  const vatAmt   = r2(totalHT * vatRate / 100);
  const totalTTC = r2(totalHT + vatAmt);

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
    ${renderTotals(doc, totalHT, vatAmt, totalTTC, vatRate)}
    ${renderSignature()}
    ${renderFooter(company)}
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
      <div class="hdr-doc-type">${typeStr}</div>
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

  const rightHtml = `
    <div class="hdr-right">
      ${logo
        ? `<img class="hdr-logo" src="${logo}" alt="Logo">`
        : `<div class="hdr-company-name">${esc(company.company_name || '')}</div>`}
    </div>
  `;

  return `<div class="doc-header">${leftHtml}${rightHtml}</div>`;
}

// ==================== COMPANY + CLIENT (two-column) ====================

function renderCompanyClient(company, client) {
  const companyHtml = `
    <div class="col-company">
      <span class="col-label">Vendeur</span>
      <div class="col-company-name">${esc(company.company_name || '')}</div>
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
      ${client.city  ? `<div class="col-client-detail">${esc(client.city)}</div>`  : ''}
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

  lines.forEach(line => {
    const modules = line.product_config?.modules ?? [];
    const options = line.product_config?.options ?? [];

    // Ligne livraison
    if (line.is_delivery) {
      rows.push(renderRow(idx++, '🚚 Livraison', 1, line.unit_price ?? 0, vatRate));
      return;
    }

    const colorRef = line.color_ref || '';

    if (modules.length > 0) {
      // Un article = un module → une ligne par module
      modules.forEach(mod => {
        rows.push(renderRow(idx++, mod.name, mod.qty || 1, mod.unit_price, vatRate, false, colorRef));
      });
      // Options éventuelles (supplément)
      options.forEach(opt => {
        rows.push(renderRow(idx++, opt.name, 1, opt.price, vatRate, true, ''));
      });
    } else {
      // Pas de modules → la ligne entière
      const desig = (line.designation || '').replace(' — ', ' · ');
      rows.push(renderRow(idx++, desig, line.qty || 1, line.unit_price ?? 0, vatRate, false, colorRef));
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

function renderRow(idx, name, qty, unitHT, vatRate, isOption = false, colorRef = '') {
  const num     = String(idx + 1).padStart(2, '0');
  const lineTTC = r2(unitHT * qty * (1 + vatRate / 100));
  const label   = isOption ? `+ ${name}` : name;

  return `
    <tr>
      <td class="td-num">${num}</td>
      <td class="td-desig">
        <div class="desig-main${isOption ? ' desig-option' : ''}">${esc(label)}</div>
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

function renderTotals(doc, totalHT, vatAmt, totalTTC, vatRate) {
  const discPct    = doc.discount_percent ?? 0;
  const depPct     = doc.deposit_percent  ?? 0;
  const depositTTC = depPct > 0 ? r2(totalTTC * depPct / 100) : 0;
  const balanceTTC = depPct > 0 ? r2(totalTTC - depositTTC)   : 0;

  return `
    <div class="total-section">
      <div class="total-ht-rows">
        ${discPct > 0 ? `
          <div class="total-ht-row">
            <span>Sous-total HT</span>
            <span>${formatPrice(doc.subtotal || 0)} €</span>
          </div>
          <div class="total-ht-row">
            <span>Remise ${discPct}%</span>
            <span>— ${formatPrice(doc.discount_amount || 0)} €</span>
          </div>
        ` : ''}
        <div class="total-ht-row">
          <span>Total HT</span>
          <span>${formatPrice(totalHT)} €</span>
        </div>
        <div class="total-ht-row">
          <span>TVA ${vatRate}%</span>
          <span>${formatPrice(vatAmt)} €</span>
        </div>
      </div>

      <div class="total-main-row">
        <span class="total-main-label">Total TTC</span>
        <div class="total-main-price">
          <span class="total-sym">€</span>
          <span class="total-amt">${formatAmount(totalTTC)}</span>
          <span class="total-suffix">TTC</span>
        </div>
      </div>

      ${depPct > 0 ? `
        <div class="deposit-rows">
          <div class="deposit-row">
            <span>Acompte ${depPct}%</span>
            <span>${formatPrice(depositTTC)} € TTC</span>
          </div>
          <div class="deposit-row deposit-row-balance">
            <span class="balance-label">Solde à régler</span>
            <span class="balance-amount">${formatAmount(balanceTTC)} € TTC</span>
          </div>
        </div>
      ` : ''}

      <div class="disclaimer">
        Dimensions indicatives ± 2–3 cm · Sous réserve de disponibilité des coloris · Fabrication artisanale italienne
      </div>
    </div>
  `;
}

// ==================== SIGNATURE ====================

function renderSignature() {
  return `
    <div class="signature-row">
      <div class="signature-block">
        <div class="signature-label">Bon pour accord</div>
        <div class="signature-sublabel">Date et signature du client</div>
        <div class="signature-line"></div>
      </div>
    </div>
  `;
}

// ==================== FOOTER ====================

function renderFooter(company) {
  const contactParts = [
    company.company_name,
    company.company_phone,
    company.company_email,
  ].filter(Boolean);

  const legalParts = [
    company.company_siret ? `SIRET ${company.company_siret}` : '',
    company.company_vat   ? `TVA ${company.company_vat}`     : '',
  ].filter(Boolean);

  return `
    <div class="doc-footer">
      <div class="footer-tagline">Votre intérieur, sublimé.</div>
      <div class="footer-contact">
        ${contactParts.map(esc).join(' · ')}
        ${legalParts.length
          ? `<br>${legalParts.map(esc).join(' · ')}`
          : ''}
      </div>
    </div>
  `;
}

// ==================== HELPERS ====================

function r2(n) { return Math.round(n * 100) / 100; }

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
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 0.005) {
    return rounded.toLocaleString('fr-FR');
  }
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(n) {
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showError(msg) {
  const page = document.getElementById('doc-page');
  if (page) page.innerHTML = `<div style="padding:40px;color:#c00;font-size:14px">⚠ ${msg}</div>`;
}
