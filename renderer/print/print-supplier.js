/**
 * print-supplier.js — Bon de commande fournisseur (sans prix)
 * Données : produits, gammes, modules, options, coloris
 */

'use strict';

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const docId  = params.get('docId');

  if (!docId) { showError('Aucun document spécifié.'); return; }

  try {
    const [docRes, logoRes, company] = await Promise.all([
      window.api.documents.getById(docId),
      window.api.app.getLogo(),
      loadCompanyConfig(),
    ]);

    if (!docRes.ok || !docRes.data) { showError('Document introuvable.'); return; }

    const doc  = docRes.data;
    const logo = (logoRes.ok && logoRes.data) ? logoRes.data : null;

    renderSupplierDoc(doc, company, logo);
    setupToolbar(doc, company);

  } catch (e) {
    showError('Erreur de chargement : ' + e.message);
  }
});

async function loadCompanyConfig() {
  const keys = ['company_name', 'company_address', 'company_city', 'company_zip',
                 'company_phone', 'company_email'];
  const results = await Promise.all(keys.map(k => window.api.app.getConfig(k)));
  const obj = {};
  keys.forEach((k, i) => { obj[k] = (results[i].ok ? results[i].data : '') || ''; });
  return obj;
}

// ==================== TOOLBAR ====================

function setupToolbar(doc, company) {
  const num      = doc.number || 'brouillon';
  const client   = doc.client_snapshot ?? {};
  const fileName = `BdC-Fournisseur-${num}.pdf`;

  document.getElementById('toolbar-title').textContent =
    `Bon de commande fournisseur — ${num}`;

  document.getElementById('btn-save-pdf').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-pdf');
    btn.disabled = true; btn.textContent = '⏳ Génération…';
    try { await window.api.print.savePDF(fileName); }
    finally { btn.disabled = false; btn.textContent = '📄 Sauvegarder PDF'; }
  });

  document.getElementById('btn-email').addEventListener('click', async () => {
    const btn = document.getElementById('btn-email');
    btn.disabled = true; btn.textContent = '⏳ Préparation…';
    try {
      const clientName = client.name || client.company || '';
      const subject = `Bon de commande — ${clientName ? clientName + ' — ' : ''}${num}`;
      const body = [
        `Bonjour,`,
        ``,
        `Veuillez trouver ci-joint notre bon de commande n° ${num}${clientName ? ' pour le client ' + clientName : ''}.`,
        ``,
        `Merci de bien vouloir confirmer la réception et le délai de livraison.`,
        ``,
        `Cordialement`,
        company.company_name || '',
      ].join('\n');

      await window.api.print.openEmail({
        defaultName: fileName,
        clientEmail: '',   // pas d'email fournisseur stocké — à saisir manuellement
        subject,
        body,
      });
    } finally {
      btn.disabled = false; btn.textContent = '✉ Envoyer au fournisseur';
    }
  });

  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-close').addEventListener('click', () => window.close());
}

// ==================== RENDER ====================

function renderSupplierDoc(doc, company, logo) {
  const lines  = doc.product_snapshot?.lines ?? [];
  const client = doc.client_snapshot ?? {};
  const num    = doc.number || '—';
  const date   = formatDate(doc.ordered_at || doc.validated_at || doc.created_at);

  // Grouper les lignes par fournisseur
  const groups = groupBySupplier(lines);

  const page = document.getElementById('doc-page');
  page.innerHTML = `
    ${renderHeader(num, date, logo, company)}
    ${renderInfoBand(num, client, date)}
    ${groups.map(g => renderSupplierGroup(g)).join('')}
    ${doc.notes ? `<div class="sup-note">📝 ${esc(doc.notes)}</div>` : ''}
    ${renderFooter(company)}
  `;
}

function renderHeader(num, date, logo, company) {
  const companyLines = [
    company.company_address,
    [company.company_zip, company.company_city].filter(Boolean).join(' '),
    company.company_phone,
    company.company_email,
  ].filter(Boolean);

  return `
    <div class="sup-header">
      <div>
        <div class="sup-type-label">Bon de commande fournisseur</div>
        <div class="sup-date">Réf. ${esc(num)} · ${date}</div>
      </div>
      <div style="text-align:right">
        ${logo ? `<img src="${logo}" class="sup-logo" alt="logo" style="margin-bottom:6px">` : ''}
        <div style="font-size:13px;font-weight:700;color:#1a1a1a">${esc(company.company_name || '')}</div>
        ${companyLines.map(l => `<div style="font-size:10px;color:#6b7280;line-height:1.6">${esc(l)}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderInfoBand(num, client, date) {
  const clientName = [client.name, client.company].filter(Boolean).join(' — ') || '—';
  return `
    <div class="sup-info-band">
      <div>
        <div class="info-label">Référence commande client</div>
        <div class="info-val">${esc(num)}</div>
        <div class="info-sub">${date}</div>
      </div>
      <div>
        <div class="info-label">Contremarque client</div>
        <div class="info-val">${esc(clientName)}</div>
        ${client.city ? `<div class="info-sub">${esc(client.city)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderSupplierGroup(group) {
  let idx = 0;
  const rows = group.lines.map(line => {
    const modules = line.product_config?.modules ?? [];
    const options = line.product_config?.options ?? [];
    const range   = line.product_config?.range_name || extractRangeName(line.designation);
    const qty     = line.qty || 1;
    const colorRef = line.color_ref || '';

    // Lignes tableau
    const modulesList = modules.map(m => {
      const dimStr = m.dimensions ? ` <span style="font-size:9px;color:#9ca3af">— ${esc(m.dimensions)}</span>` : '';
      return `<div class="desig-module">↳ ${esc(m.name)}${m.qty > 1 ? ` × ${m.qty}` : ''}${dimStr}</div>`;
    }).join('');

    const optionsList = options.map(o =>
      `<div class="desig-option">＋ ${esc(o.name)}${o.qty > 1 ? ` × ${o.qty}` : ''}</div>`
    ).join('');

    const colorBlock = colorRef
      ? `<div><span class="desig-coloris">🎨 ${esc(colorRef)}</span></div>`
      : '';

    const productName = line.designation?.split('—')[0]?.trim() || line.designation || '';

    return `
      <tr>
        <td class="td-num">${String(++idx).padStart(2, '0')}</td>
        <td class="td-desig">
          <div class="desig-main">${esc(productName)}</div>
          ${range ? `<div class="desig-gamme">Gamme : ${esc(range)}</div>` : ''}
          ${modulesList}
          ${optionsList}
          ${colorBlock}
        </td>
        <td class="td-qty">${qty}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="supplier-block">
      <div class="supplier-block-label">Fournisseur</div>
      <div class="supplier-block-name">${esc(group.supplier)}</div>
    </div>
    <table class="articles-table">
      <thead>
        <tr>
          <th>N°</th>
          <th>Désignation / Référence</th>
          <th style="text-align:center">Qté</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderFooter(company) {
  const parts = [
    company.company_name,
    company.company_address,
    [company.company_zip, company.company_city].filter(Boolean).join(' '),
    company.company_phone,
    company.company_email,
  ].filter(Boolean);

  return `
    <div class="sup-footer">
      <div style="font-size:8px;color:#6b7280;font-style:italic;margin-bottom:5px;padding:5px 10px;border:1px solid #e5e7eb;border-radius:3px;display:inline-block">
        Ce bon de commande tient lieu de facture une fois acquitté.
      </div>
      <div>${parts.map(esc).join(' · ')}</div>
    </div>
  `;
}

// ==================== HELPERS ====================

function groupBySupplier(lines) {
  const map = new Map();
  lines.forEach(line => {
    if (line.is_delivery) return;
    const supplier = line.product_config?.supplier_name || 'Fournisseur non défini';
    if (!map.has(supplier)) map.set(supplier, []);
    map.get(supplier).push(line);
  });
  return [...map.entries()].map(([supplier, lines]) => ({ supplier, lines }));
}

function extractRangeName(designation) {
  // "Canapé Dante — 3 places" → "3 places"
  const parts = (designation || '').split('—');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

function formatDate(str) {
  if (!str) return new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  return new Date(str).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
