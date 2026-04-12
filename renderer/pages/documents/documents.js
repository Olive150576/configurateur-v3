/**
 * Documents — Logique de la page documents
 * Cycle de vie complet : draft → validated → sent → ordered/cancelled → archived
 */

'use strict';

// ==================== CONSTANTES ====================

const STATUS_LABELS  = { draft:'Brouillon', validated:'Validé', sent:'Envoyé',
                          ordered:'Commandé', cancelled:'Annulé', archived:'Archivé' };
const STATUS_CLASSES = { draft:'badge-gray', validated:'badge-primary', sent:'badge-warning',
                          ordered:'badge-success', cancelled:'badge-danger', archived:'badge-gray' };
const TYPE_LABELS    = { devis:'Devis', offre:'Offre', commande:'Commande' };
const TYPE_CLASSES   = { devis:'badge-primary', offre:'badge-warning', commande:'badge-success' };

const STATUS_TITLES = {
  '':          'Tous les documents',
  draft:       'Brouillons',
  validated:   'Documents validés',
  sent:        'Documents envoyés',
  ordered:     'Commandes',
  cancelled:   'Documents annulés',
  archived:    'Documents archivés',
};

// ==================== ÉTAT ====================

let state = {
  allDocuments:    [],
  documents:       [],
  currentStatus:   '',
  currentType:     '',
  searchTerm:      '',
  clients:         [],

  // Modal document
  editingDocId:    null,
  docLines:        [],
  selectedClient:  null,
  totals:          { subtotal:0, discountPct:0, discountAmt:0, total:0, depositPct:30, depositAmt:0, balance:0 },

  // Mini-modal ligne
  editingLineIdx:  null,

  // Confirmation
  confirmCallback: null,
};

// ==================== INITIALISATION ====================

let alertDays = 15;

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupTypeTabs();
  setupSearch();
  setupDocModal();
  setupLineModal();
  setupConfirm();
  await Promise.all([loadDocuments(), loadClients(), loadAlertDays()]);

  // Pré-sélection client depuis la page clients (query string ?client_id=...&client_name=...)
  const params = new URLSearchParams(window.location.search);
  if (params.get('client_id') || params.get('client_name')) {
    openDocModal();
    if (params.get('client_name')) {
      document.getElementById('f-client-search').value = params.get('client_name');
      // Trouver le client dans la liste chargée
      const match = state.clients.find(c => c.id === params.get('client_id'));
      if (match) {
        state.selectedClient = {
          id: match.id, name: match.name, email: match.email,
          phone: match.phone, company: match.company,
          address: match.address, city: match.city, zip: match.zip,
        };
        showClientInfo(state.selectedClient);
      }
    }
  }
});

function setupNav() {
  document.querySelectorAll('.sidebar-item[data-status]').forEach(item => {
    item.addEventListener('click', () => {
      state.currentStatus = item.dataset.status;
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('page-title').textContent =
        STATUS_TITLES[state.currentStatus] ?? 'Documents';
      applyFiltersAndRender();
    });
  });
}

function setupTypeTabs() {
  document.querySelectorAll('.tab-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentType = btn.dataset.type;
      document.querySelectorAll('.tab-btn[data-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFiltersAndRender();
    });
  });
}

function setupSearch() {
  const input = document.getElementById('search-input');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.searchTerm = input.value.trim();
      applyFiltersAndRender();
    }, 250);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; state.searchTerm = ''; applyFiltersAndRender(); }
  });
}

function setupDocModal() {
  document.getElementById('btn-new-doc')
    .addEventListener('click', () => openDocModal());
  document.getElementById('btn-save-doc')
    .addEventListener('click', handleSaveDoc);
  document.getElementById('btn-add-line')
    .addEventListener('click', () => openLineModal());
  document.getElementById('btn-clear-client')
    .addEventListener('click', clearClientSelection);

  // Recalcul totaux quand remise ou acompte change
  document.getElementById('f-discount-pct')
    .addEventListener('input', recalcTotals);
  document.getElementById('f-deposit-pct')
    .addEventListener('input', recalcTotals);

  // Client search → correspondance live
  document.getElementById('f-client-search')
    .addEventListener('input', handleClientSearchInput);

  // Empty state button
  document.getElementById('btn-empty-new-doc')
    ?.addEventListener('click', () => openDocModal());

  // Universal modal close via data-close-modal
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.closeModal;
      document.getElementById(id)?.classList.remove('show');
      if (id === 'modal-doc')     { state.editingDocId = null; state.selectedClient = null; state.docLines = []; }
      if (id === 'modal-line')    state.editingLineIdx = null;
      if (id === 'modal-confirm') state.confirmCallback = null;
    });
  });

  // Event delegation — docs table
  document.getElementById('docs-tbody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'edit')      editDoc(id);
    if (action === 'validate')  validateDoc(id);
    if (action === 'sent')      markSent(id);
    if (action === 'transform') transformConfirm(id);
    if (action === 'cancel')    cancelDocConfirm(id);
    if (action === 'archive')   archiveDocConfirm(id);
    if (action === 'duplicate') duplicateDoc(id);
    if (action === 'print')          printDoc(id);
    if (action === 'print-supplier') printSupplierDoc(id);
    if (action === 'delete')         deleteDocConfirm(id);
  });
}

function setupLineModal() {
  document.getElementById('btn-confirm-line')
    .addEventListener('click', handleSaveLine);

  ['l-qty', 'l-unit-price', 'l-disc-pct'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalcLineTotal);
  });

  document.getElementById('modal-line').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLineModal();
  });

  // Event delegation — lines table
  document.getElementById('lines-tbody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (btn.dataset.action === 'edit-line')   openLineModal(idx);
    if (btn.dataset.action === 'delete-line') deleteLine(idx);
  });
}

function setupConfirm() {
  document.getElementById('btn-confirm-action').addEventListener('click', () => {
    if (state.confirmCallback) state.confirmCallback();
    closeConfirm();
  });
  document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirm();
  });
}

// ==================== CHARGEMENT DONNÉES ====================

async function loadAlertDays() {
  const res = await window.api.app.getConfig('alert_days');
  if (res.ok && res.data) alertDays = parseInt(res.data) || 15;
}

async function loadDocuments() {
  const res = await window.api.documents.getAll({});
  if (!res.ok) { Utils.toast('Erreur chargement documents', 'error'); return; }
  state.allDocuments = res.data;
  applyFiltersAndRender();
  updateSidebarCounts(res.data);
}

async function loadClients() {
  const res = await window.api.clients.getAll();
  if (!res.ok) return;
  state.clients = res.data;

  const datalist = document.getElementById('clients-datalist');
  datalist.innerHTML = '';
  res.data.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    if (c.company) opt.value = `${c.name} (${c.company})`;
    datalist.appendChild(opt);
  });
}

// ==================== FILTRES ====================

function applyFiltersAndRender() {
  let docs = state.allDocuments;

  if (state.currentStatus) {
    docs = docs.filter(d => d.status === state.currentStatus);
  }
  if (state.currentType) {
    docs = docs.filter(d => d.type === state.currentType);
  }
  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
    docs = docs.filter(d =>
      (d.client_name || '').toLowerCase().includes(term) ||
      (d.number || '').toLowerCase().includes(term)
    );
  }

  state.documents = docs;
  renderDocumentsTable(docs);
  renderStats(state.allDocuments);
}

function updateSidebarCounts(docs) {
  const counts = { draft:0, validated:0, sent:0, ordered:0, cancelled:0, archived:0 };
  docs.forEach(d => { if (counts[d.status] !== undefined) counts[d.status]++; });

  const all = docs.filter(d => d.status !== 'archived').length;
  setCount('count-all', all);
  Object.entries(counts).forEach(([status, n]) => setCount(`count-${status}`, n));
}

function setCount(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) { el.textContent = n; el.style.display = 'inline-flex'; }
  else el.style.display = 'none';
}

// ==================== AFFICHAGE TABLE ====================

function renderDocumentsTable(docs) {
  const tbody   = document.getElementById('docs-tbody');
  const empty   = document.getElementById('doc-empty');
  const wrapper = document.getElementById('table-wrapper');
  const count   = document.getElementById('doc-count');

  count.textContent = docs.length;
  tbody.innerHTML = '';

  if (docs.length === 0) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  docs.forEach(doc => {
    const overdue  = isOverdue(doc);
    const tr = document.createElement('tr');
    if (overdue) tr.style.background = '#fff7ed';
    tr.innerHTML = `
      <td>
        ${doc.number
          ? `<div class="font-bold">${Utils.escapeHtml(doc.number)}</div>`
          : `<div style="color:var(--color-gray-400);font-style:italic;font-size:13px">Brouillon</div>`}
        <div class="text-xs text-muted">${Utils.escapeHtml(doc.id.slice(-8))}</div>
      </td>
      <td style="text-align:center">
        <span class="badge ${TYPE_CLASSES[doc.type] ?? 'badge-gray'}">
          ${TYPE_LABELS[doc.type] ?? doc.type}
        </span>
      </td>
      <td>
        ${doc.client_name
          ? Utils.escapeHtml(doc.client_name)
          : `<span class="text-muted">—</span>`}
      </td>
      <td style="text-align:right;font-weight:600">
        ${Utils.formatPrice(doc.total)}
      </td>
      <td style="text-align:center">
        <span class="badge ${STATUS_CLASSES[doc.status] ?? 'badge-gray'}">
          ${STATUS_LABELS[doc.status] ?? doc.status}
        </span>
        ${overdue ? `<span title="En attente depuis plus de ${alertDays} jours" style="margin-left:4px;font-size:13px">⚠️</span>` : ''}
      </td>
      <td style="font-size:13px;color:var(--color-gray-600)">
        ${Utils.formatDate(doc.created_at)}
      </td>
      <td style="text-align:right">
        ${renderDocActions(doc)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDocActions(doc) {
  const id = doc.id;
  let html = '<div class="flex gap-1" style="justify-content:flex-end;flex-wrap:wrap">';

  // Aperçu disponible pour tous les statuts
  html += btn('👁', 'Aperçu / PDF', 'print', id);

  if (doc.status === 'draft') {
    html += btn('✏️', 'Éditer', 'edit', id);
    html += btnLabel('Valider', 'validate', id, 'btn-primary');
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }
  else if (doc.status === 'validated') {
    html += btnLabel('📤 Envoyé', 'sent', id, 'btn-ghost');
    if (doc.type !== 'commande')
      html += btnLabel('→ Commande', 'transform', id, 'btn-ghost');
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗄', 'Archiver', 'archive', id);
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }
  else if (doc.status === 'sent') {
    if (doc.type !== 'commande')
      html += btnLabel('→ Commande', 'transform', id, 'btn-ghost');
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗄', 'Archiver', 'archive', id);
    html += btn('✕', 'Annuler', 'cancel', id, 'color:var(--color-danger)');
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }
  else if (doc.status === 'ordered') {
    html += btnLabel('📦 BdC Fournisseur', 'print-supplier', id, 'btn-ghost');
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗄', 'Archiver', 'archive', id);
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }
  else if (doc.status === 'cancelled') {
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗄', 'Archiver', 'archive', id);
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }
  else if (doc.status === 'archived') {
    html += btn('📋', 'Dupliquer', 'duplicate', id);
    html += btn('🗑', 'Supprimer', 'delete', id, 'color:var(--color-danger)');
  }

  html += '</div>';
  return html;
}

function btn(icon, title, action, id, extraStyle = '') {
  return `<button class="btn btn-ghost btn-sm btn-icon" title="${title}"
    data-action="${action}" data-id="${id}" style="${extraStyle}">${icon}</button>`;
}

function btnLabel(label, action, id, cls = 'btn-ghost') {
  return `<button class="btn ${cls} btn-sm" style="padding:2px 8px;font-size:12px"
    data-action="${action}" data-id="${id}">${label}</button>`;
}

// ==================== STATS ====================

function renderStats(docs) {
  const nonArchived = docs.filter(d => d.status !== 'archived');
  const drafts      = docs.filter(d => d.status === 'draft');
  const active      = docs.filter(d => ['validated','sent'].includes(d.status));
  const revenue     = docs.filter(d => d.status === 'ordered' && d.type === 'commande')
                          .reduce((s, d) => s + (d.total ?? 0), 0);

  document.getElementById('stat-total').textContent   = nonArchived.length;
  document.getElementById('stat-drafts').textContent  = drafts.length;
  document.getElementById('stat-active').textContent  = active.length;
  document.getElementById('stat-revenue').textContent = Utils.formatPrice(revenue);
}

// ==================== MODAL DOCUMENT — OUVERTURE ====================

function openDocModal(doc = null) {
  state.editingDocId   = doc ? doc.id : null;
  state.docLines       = doc ? (doc.product_snapshot?.lines ?? []) : [];
  state.selectedClient = doc ? (doc.client_snapshot ?? null) : null;

  // Type
  const type = doc?.type ?? 'devis';
  document.querySelector(`input[name="doc-type"][value="${type}"]`).checked = true;
  document.querySelectorAll('input[name="doc-type"]').forEach(r => {
    r.disabled = !!doc; // verrouiller en édition
  });

  // Client
  const clientSearch = document.getElementById('f-client-search');
  if (doc?.client_snapshot?.name) {
    clientSearch.value = doc.client_snapshot.name;
    showClientInfo(doc.client_snapshot);
  } else {
    clientSearch.value = '';
    clearClientDisplay();
  }

  // Notes
  document.getElementById('f-notes').value = doc?.notes ?? '';

  // Remise / Acompte
  document.getElementById('f-discount-pct').value = doc?.discount_percent ?? 0;
  document.getElementById('f-deposit-pct').value  = doc?.deposit_percent  ?? 30;

  // Titre
  document.getElementById('modal-doc-title').textContent =
    doc ? `Éditer : ${doc.number ?? 'brouillon'}` : 'Nouveau document';

  // Erreur
  document.getElementById('modal-doc-error').style.display = 'none';

  // Bouton save
  document.getElementById('btn-save-doc').textContent =
    doc ? 'Mettre à jour' : 'Enregistrer le brouillon';

  renderLinesTable();
  recalcTotals();

  document.getElementById('modal-doc').classList.add('show');
  setTimeout(() => document.getElementById('f-client-search').focus(), 50);
}

function closeDocModal() {
  document.getElementById('modal-doc').classList.remove('show');
  state.editingDocId   = null;
  state.selectedClient = null;
  state.docLines       = [];
}

async function editDoc(docId) {
  const res = await window.api.documents.getById(docId);
  if (!res.ok || !res.data) { Utils.toast('Document non trouvé', 'error'); return; }
  openDocModal(res.data);
}

// ==================== MODAL DOCUMENT — CLIENT ====================

function handleClientSearchInput() {
  const val = document.getElementById('f-client-search').value.trim();
  if (!val) { clearClientDisplay(); state.selectedClient = null; return; }

  // Cherche correspondance exacte dans la liste préchargée
  const match = state.clients.find(c =>
    c.name === val || `${c.name} (${c.company})` === val
  );

  if (match) {
    state.selectedClient = {
      id: match.id, name: match.name,
      email: match.email, phone: match.phone,
      company: match.company, address: match.address,
      city: match.city, zip: match.zip,
    };
    showClientInfo(state.selectedClient);
  } else {
    // Saisie libre → client anonyme
    state.selectedClient = { name: val };
    clearClientDisplay();
  }
}

function showClientInfo(client) {
  const el = document.getElementById('selected-client-info');
  const lines = [client.name];
  if (client.company) lines.push(client.company);
  if (client.email)   lines.push(client.email);
  if (client.phone)   lines.push(client.phone);
  el.innerHTML = lines.map(l => Utils.escapeHtml(l)).join('<br>');
  el.style.display = 'block';
  document.getElementById('btn-clear-client').style.display = 'inline-flex';
}

function clearClientDisplay() {
  document.getElementById('selected-client-info').style.display = 'none';
  document.getElementById('btn-clear-client').style.display = 'none';
}

function clearClientSelection() {
  state.selectedClient = null;
  document.getElementById('f-client-search').value = '';
  clearClientDisplay();
}

// ==================== MODAL DOCUMENT — SAUVEGARDE ====================

async function handleSaveDoc() {
  recalcTotals();
  const t = state.totals;

  const type = document.querySelector('input[name="doc-type"]:checked')?.value;
  if (!type) { Utils.toast('Sélectionnez un type de document', 'warning'); return; }

  const notes = document.getElementById('f-notes').value.trim();

  // Résolution client
  let client_id       = null;
  let client_snapshot = {};
  if (state.selectedClient) {
    client_id       = state.selectedClient.id ?? null;
    client_snapshot = state.selectedClient;
  }

  const docData = {
    type,
    client_id,
    client_snapshot,
    product_snapshot: { lines: state.docLines },
    subtotal:         t.subtotal,
    discount_percent: t.discountPct,
    discount_amount:  t.discountAmt,
    total:            t.total,
    deposit_percent:  t.depositPct,
    deposit_amount:   t.depositAmt,
    balance:          t.balance,
    notes,
  };

  const btn = document.getElementById('btn-save-doc');
  btn.disabled    = true;
  btn.textContent = 'Enregistrement...';

  let res;
  if (state.editingDocId) {
    res = await window.api.documents.update(state.editingDocId, docData);
  } else {
    res = await window.api.documents.create(docData);
  }

  btn.disabled    = false;
  btn.textContent = state.editingDocId ? 'Mettre à jour' : 'Enregistrer le brouillon';

  if (!res.ok) {
    const errEl = document.getElementById('modal-doc-error');
    errEl.textContent = res.errors?.join('\n') || res.error;
    errEl.style.display = 'flex';
    return;
  }

  closeDocModal();
  Utils.toast(state.editingDocId ? 'Document mis à jour' : 'Brouillon créé', 'success');
  await loadDocuments();
}

// ==================== TOTAUX ====================

function recalcTotals() {
  const subtotal   = state.docLines.reduce((s, l) => s + (l.total ?? 0), 0);
  const discPct    = clamp(parseFloat(document.getElementById('f-discount-pct').value) || 0, 0, 100);
  const discAmt    = round2(subtotal * discPct / 100);
  const total      = round2(subtotal - discAmt);
  const depositPct = clamp(parseFloat(document.getElementById('f-deposit-pct').value) || 0, 0, 100);
  const depositAmt = round2(total * depositPct / 100);
  const balance    = round2(total - depositAmt);

  state.totals = { subtotal, discountPct: discPct, discountAmt: discAmt,
                   total, depositPct, depositAmt, balance };

  document.getElementById('summary-subtotal').textContent = Utils.formatPrice(subtotal);
  document.getElementById('summary-discount').textContent = `— ${Utils.formatPrice(discAmt)}`;
  document.getElementById('summary-total').textContent    = Utils.formatPrice(total);
  document.getElementById('summary-deposit').textContent  = Utils.formatPrice(depositAmt);
  document.getElementById('summary-balance').textContent  = Utils.formatPrice(balance);
}

function isOverdue(doc) {
  if (!['validated', 'sent'].includes(doc.status)) return false;
  const ref = doc.validated_at || doc.created_at;
  if (!ref) return false;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  return days >= alertDays;
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

// ==================== LIGNES ====================

function openLineModal(idx = null) {
  state.editingLineIdx = idx;
  const line = idx !== null ? state.docLines[idx] : null;

  document.getElementById('l-designation').value  = line?.designation  ?? '';
  document.getElementById('l-description').value  = line?.description  ?? '';
  document.getElementById('l-qty').value           = line?.qty          ?? 1;
  document.getElementById('l-unit-price').value    = line?.unit_price   ?? 0;
  document.getElementById('l-disc-pct').value      = line?.discount_percent ?? 0;

  ['l-designation','l-qty','l-unit-price'].forEach(id =>
    document.getElementById(id).classList.remove('error'));
  ['err-l-designation','err-l-qty','err-l-unit-price'].forEach(id =>
    document.getElementById(id).style.display = 'none');

  document.getElementById('modal-line-title').textContent =
    idx !== null ? 'Modifier la ligne' : 'Ajouter une ligne';
  document.getElementById('btn-confirm-line').textContent =
    idx !== null ? 'Mettre à jour' : 'Ajouter';

  recalcLineTotal();
  document.getElementById('modal-line').classList.add('show');
  setTimeout(() => document.getElementById('l-designation').focus(), 50);
}

function closeLineModal() {
  document.getElementById('modal-line').classList.remove('show');
  state.editingLineIdx = null;
}

function handleSaveLine() {
  const designation = document.getElementById('l-designation').value.trim();
  const description = document.getElementById('l-description').value.trim();
  const qty         = parseFloat(document.getElementById('l-qty').value);
  const unitPrice   = parseFloat(document.getElementById('l-unit-price').value);
  const discPct     = clamp(parseFloat(document.getElementById('l-disc-pct').value) || 0, 0, 100);

  let valid = true;
  if (!designation) {
    document.getElementById('l-designation').classList.add('error');
    document.getElementById('err-l-designation').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('l-designation').classList.remove('error');
    document.getElementById('err-l-designation').style.display = 'none';
  }
  if (isNaN(qty) || qty <= 0) {
    document.getElementById('l-qty').classList.add('error');
    document.getElementById('err-l-qty').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('l-qty').classList.remove('error');
    document.getElementById('err-l-qty').style.display = 'none';
  }
  if (isNaN(unitPrice) || unitPrice < 0) {
    document.getElementById('l-unit-price').classList.add('error');
    document.getElementById('err-l-unit-price').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('l-unit-price').classList.remove('error');
    document.getElementById('err-l-unit-price').style.display = 'none';
  }
  if (!valid) return;

  const total = round2(qty * unitPrice * (1 - discPct / 100));
  const lineData = {
    id: state.editingLineIdx !== null
      ? state.docLines[state.editingLineIdx].id
      : `line_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
    designation, description, qty, unit_price: unitPrice,
    discount_percent: discPct, total,
  };

  if (state.editingLineIdx !== null) {
    state.docLines[state.editingLineIdx] = lineData;
  } else {
    state.docLines.push(lineData);
  }

  renderLinesTable();
  recalcTotals();
  closeLineModal();
}

function deleteLine(idx) {
  state.docLines.splice(idx, 1);
  renderLinesTable();
  recalcTotals();
}

function recalcLineTotal() {
  const qty       = parseFloat(document.getElementById('l-qty').value) || 0;
  const price     = parseFloat(document.getElementById('l-unit-price').value) || 0;
  const disc      = clamp(parseFloat(document.getElementById('l-disc-pct').value) || 0, 0, 100);
  const total     = round2(qty * price * (1 - disc / 100));
  document.getElementById('l-line-total').textContent = Utils.formatPrice(total);
}

function renderLinesTable() {
  const empty   = document.getElementById('lines-empty');
  const wrapper = document.getElementById('lines-table-wrapper');
  const tbody   = document.getElementById('lines-tbody');

  if (state.docLines.length === 0) {
    empty.style.display   = 'flex';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  tbody.innerHTML = state.docLines.map((line, idx) => `
    <tr style="border-bottom:1px solid var(--color-gray-100)">
      <td style="padding:8px 8px">
        <div style="font-weight:500">${Utils.escapeHtml(line.designation)}</div>
        ${line.description
          ? `<div style="font-size:11px;color:var(--color-gray-500);margin-top:2px">
               ${Utils.escapeHtml(line.description)}</div>`
          : ''}
      </td>
      <td style="padding:8px;text-align:center">${line.qty}</td>
      <td style="padding:8px;text-align:right">${Utils.formatPrice(line.unit_price)}</td>
      <td style="padding:8px;text-align:center">
        ${line.discount_percent > 0 ? line.discount_percent + '%' : '—'}
      </td>
      <td style="padding:8px;text-align:right;font-weight:600">
        ${Utils.formatPrice(line.total)}
      </td>
      <td style="padding:4px 8px">
        <div class="flex gap-1" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="edit-line" data-idx="${idx}"
            title="Modifier">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-line" data-idx="${idx}"
            title="Supprimer" style="color:var(--color-danger)">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ==================== ACTIONS DOCUMENT ====================

function validateDoc(docId) {
  openConfirm(
    'Valider le document',
    'La validation attribue un numéro définitif. Le document ne pourra plus être modifié.',
    async () => {
      const res = await window.api.documents.validate(docId);
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast(`Document validé : ${res.data.number}`, 'success');
      await loadDocuments();
    }
  );
}

async function markSent(docId) {
  const res = await window.api.documents.transition(docId, 'sent');
  if (!res.ok) { Utils.toast(res.error, 'error'); return; }
  Utils.toast('Document marqué comme envoyé', 'success');
  await loadDocuments();
}

function transformConfirm(docId) {
  const doc = state.documents.find(d => d.id === docId);
  openConfirm(
    'Transformer en commande',
    `Créer une commande à partir de "${doc?.number ?? 'ce document'}" ? Le document source passera en statut "commandé".`,
    async () => {
      const res = await window.api.documents.transform(docId, 'commande');
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast(`Commande créée : ${res.data.number}`, 'success');
      await loadDocuments();
    }
  );
}

function cancelDocConfirm(docId) {
  const doc = state.documents.find(d => d.id === docId);
  const name = doc?.number ?? 'ce brouillon';
  openConfirm(
    'Annuler le document',
    `Annuler "${name}" ? Cette action est irréversible.`,
    async () => {
      const res = await window.api.documents.transition(docId, 'cancelled');
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast('Document annulé', 'success');
      await loadDocuments();
    }
  );
}

function archiveDocConfirm(docId) {
  openConfirm(
    'Archiver le document',
    'Archiver ce document ? Il ne sera plus visible dans les listes actives.',
    async () => {
      const res = await window.api.documents.transition(docId, 'archived');
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast('Document archivé', 'success');
      await loadDocuments();
    }
  );
}

function deleteDocConfirm(docId) {
  const doc  = state.allDocuments.find(d => d.id === docId);
  const name = doc?.number ? `"${doc.number}"` : 'ce brouillon';
  const warn = doc?.number
    ? `⚠️ Supprimer définitivement ${name} ? Cette action est irréversible — le numéro ne sera pas réattribué.`
    : `Supprimer définitivement ce brouillon ? Cette action est irréversible.`;

  openConfirm(
    'Supprimer le document',
    warn,
    async () => {
      const res = await window.api.documents.delete(docId);
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast('Document supprimé', 'success');
      await loadDocuments();
    }
  );
}

async function printDoc(docId) {
  const res = await window.api.documents.print(docId);
  if (!res.ok) Utils.toast('Impossible d\'ouvrir l\'aperçu : ' + res.error, 'error');
}

async function printSupplierDoc(docId) {
  const res = await window.api.documents.printSupplier(docId);
  if (!res.ok) Utils.toast('Impossible de générer le BdC fournisseur : ' + res.error, 'error');
}

async function duplicateDoc(docId) {
  const res = await window.api.documents.duplicate(docId);
  if (!res.ok) { Utils.toast(res.error, 'error'); return; }
  Utils.toast('Document dupliqué (nouveau brouillon)', 'success');
  await loadDocuments();
}

// ==================== MODAL CONFIRMATION ====================

function openConfirm(title, message, callback) {
  state.confirmCallback = callback;
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('modal-confirm').classList.add('show');
}

function closeConfirm() {
  document.getElementById('modal-confirm').classList.remove('show');
  state.confirmCallback = null;
}
