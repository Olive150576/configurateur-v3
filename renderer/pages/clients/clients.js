/**
 * Clients — Logique de la page clients
 */

'use strict';

// ==================== ÉTAT ====================

let state = {
  clients:       [],
  editingId:     null,
  viewingId:     null,
  confirmCb:     null,
};

// ==================== INITIALISATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupSearch();
  setupModal();
  setupImportExport();
  await loadClients();
});

function setupNav() {
  document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
}

function setupSearch() {
  const input = document.getElementById('search-input');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => handleSearch(input.value.trim()), 250);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; handleSearch(''); }
  });
}

function setupModal() {
  document.getElementById('btn-new-client')
    .addEventListener('click', () => openClientModal());
  document.getElementById('btn-empty-new-client')
    ?.addEventListener('click', () => openClientModal());
  document.getElementById('btn-save-client')
    .addEventListener('click', handleSaveClient);

  // Délégation sur la table clients
  document.getElementById('clients-tbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'view-client')    openViewModal(id);
    if (btn.dataset.action === 'edit-client')    editClient(id);
    if (btn.dataset.action === 'new-doc-client') newDocForClient(id);
  });

  // Boutons fermeture via JS (plus fiable que onclick inline)
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    const targetId = btn.dataset.closeModal;
    btn.addEventListener('click', () => {
      document.getElementById(targetId)?.classList.remove('show');
      if (targetId === 'modal-client') state.editingId = null;
      if (targetId === 'modal-view')   state.viewingId = null;
    });
  });

  // Fermeture au clic sur le fond
  ['modal-client', 'modal-view'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) {
        e.target.classList.remove('show');
        if (id === 'modal-client') state.editingId = null;
        if (id === 'modal-view')   state.viewingId = null;
      }
    });
  });
}

function setupImportExport() {
  document.getElementById('btn-import').addEventListener('click', handleImport);
  document.getElementById('btn-export-json').addEventListener('click', handleExport);
}

// ==================== NAVIGATION ====================

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.style.display = 'block';
  const nav = document.querySelector(`[data-view="${view}"]`);
  if (nav) nav.classList.add('active');

  const titles = { list: 'Clients', import: 'Importer des clients', export: 'Exporter les clients' };
  document.getElementById('page-title').textContent = titles[view] ?? 'Clients';

  const newBtn = document.getElementById('btn-new-client');
  const searchWrapper = document.querySelector('.search-wrapper');
  newBtn.style.display      = view === 'list' ? 'inline-flex' : 'none';
  searchWrapper.style.display = view === 'list' ? 'flex' : 'none';
}

// ==================== DONNÉES ====================

async function loadClients() {
  const res = await window.api.clients.getAll();
  if (!res.ok) { Utils.toast('Erreur chargement clients', 'error'); return; }
  state.clients = res.data;
  renderTable(res.data);
  renderStats(res.data);
}

async function handleSearch(term) {
  if (!term) { await loadClients(); return; }
  const res = await window.api.clients.search(term);
  if (!res.ok) return;
  renderTable(res.data);
  document.getElementById('client-count').textContent = res.data.length;
}

// ==================== RENDU TABLE ====================

function renderTable(clients) {
  const tbody   = document.getElementById('clients-tbody');
  const empty   = document.getElementById('empty-state');
  const wrapper = document.getElementById('table-wrapper');
  const count   = document.getElementById('client-count');

  count.textContent = clients.length;
  tbody.innerHTML   = '';

  if (clients.length === 0) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="font-bold" style="cursor:pointer;color:var(--color-primary)"
          data-action="view-client" data-id="${c.id}">${Utils.escapeHtml(c.name)}</div>
        ${c.notes ? `<div class="text-xs text-muted">${Utils.escapeHtml(c.notes.slice(0, 60))}${c.notes.length > 60 ? '…' : ''}</div>` : ''}
      </td>
      <td>${c.company ? Utils.escapeHtml(c.company) : '<span class="text-muted">—</span>'}</td>
      <td>${c.email
        ? `<a href="mailto:${Utils.escapeHtml(c.email)}" style="color:var(--color-primary);font-size:13px">${Utils.escapeHtml(c.email)}</a>`
        : '<span class="text-muted">—</span>'}</td>
      <td style="font-size:13px">${c.phone || '<span class="text-muted">—</span>'}</td>
      <td style="font-size:13px">
        ${c.city
          ? `${Utils.escapeHtml(c.city)}${c.zip ? ' <span class="text-muted text-xs">(${c.zip})</span>' : ''}`
          : '<span class="text-muted">—</span>'}
      </td>
      <td style="text-align:right">
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm btn-icon" title="Voir la fiche"
            data-action="view-client" data-id="${c.id}">👁</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Modifier"
            data-action="edit-client" data-id="${c.id}">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Nouveau devis"
            data-action="new-doc-client" data-id="${c.id}">📄</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStats(clients) {
  const companies  = new Set(clients.map(c => c.company).filter(Boolean)).size;
  const thisMonth  = clients.filter(c => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  document.getElementById('stat-total').textContent     = clients.length;
  document.getElementById('stat-companies').textContent = companies;
  document.getElementById('stat-this-month').textContent = thisMonth;
  // stat-with-docs: on ne peut pas le calculer côté renderer sans un endpoint dédié
  document.getElementById('stat-with-docs').textContent = '—';
}

// ==================== MODAL ÉDITION ====================

function openClientModal(client = null) {
  state.editingId = client ? client.id : null;

  document.getElementById('f-name').value    = client?.name    ?? '';
  document.getElementById('f-company').value = client?.company ?? '';
  document.getElementById('f-email').value   = client?.email   ?? '';
  document.getElementById('f-phone').value   = client?.phone   ?? '';
  document.getElementById('f-address').value = client?.address ?? '';
  document.getElementById('f-zip').value     = client?.zip     ?? '';
  document.getElementById('f-city').value    = client?.city    ?? '';
  document.getElementById('f-notes').value   = client?.notes   ?? '';

  document.getElementById('modal-client-title').textContent =
    client ? `Modifier : ${client.name}` : 'Nouveau client';
  document.getElementById('btn-save-client').textContent =
    client ? 'Mettre à jour' : 'Enregistrer';

  document.getElementById('modal-error').style.display = 'none';
  document.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

  document.getElementById('modal-client').classList.add('show');
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

function closeClientModal() {
  document.getElementById('modal-client').classList.remove('show');
  state.editingId = null;
}

function editClient(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (client) openClientModal(client);
}

async function handleSaveClient() {
  const name  = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();

  let valid = true;
  if (!name) {
    document.getElementById('f-name').classList.add('error');
    document.getElementById('err-name').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('f-name').classList.remove('error');
    document.getElementById('err-name').style.display = 'none';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('f-email').classList.add('error');
    document.getElementById('err-email').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('f-email').classList.remove('error');
    document.getElementById('err-email').style.display = 'none';
  }
  if (!valid) return;

  const data = {
    name,
    company: document.getElementById('f-company').value.trim(),
    email,
    phone:   document.getElementById('f-phone').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    zip:     document.getElementById('f-zip').value.trim(),
    city:    document.getElementById('f-city').value.trim(),
    notes:   document.getElementById('f-notes').value.trim(),
  };

  const btn = document.getElementById('btn-save-client');
  btn.disabled = true;

  let res;
  if (state.editingId) {
    res = await window.api.clients.update(state.editingId, data);
  } else {
    res = await window.api.clients.create(data);
  }

  btn.disabled = false;

  if (!res.ok) {
    const errEl = document.getElementById('modal-error');
    errEl.textContent = res.errors?.join('\n') || res.error;
    errEl.style.display = 'flex';
    return;
  }

  closeClientModal();
  Utils.toast(state.editingId ? 'Client mis à jour' : 'Client créé', 'success');
  await loadClients();
}

// ==================== MODAL FICHE ====================

function openViewModal(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return;

  state.viewingId = clientId;
  document.getElementById('view-client-name').textContent = client.name;

  const rows = [
    client.company  && ['Entreprise', client.company],
    client.email    && ['Email',      `<a href="mailto:${Utils.escapeHtml(client.email)}" style="color:var(--color-primary)">${Utils.escapeHtml(client.email)}</a>`],
    client.phone    && ['Téléphone',  Utils.escapeHtml(client.phone)],
    (client.address || client.city) && ['Adresse',
      [client.address, [client.zip, client.city].filter(Boolean).join(' ')]
        .filter(Boolean).map(Utils.escapeHtml).join('<br>')],
    client.notes    && ['Notes',      `<em style="color:var(--color-gray-600)">${Utils.escapeHtml(client.notes)}</em>`],
    ['Créé le',       Utils.formatDate(client.created_at)],
  ].filter(Boolean);

  document.getElementById('view-client-body').innerHTML = `
    <dl style="display:grid;grid-template-columns:110px 1fr;gap:10px 16px;font-size:13px">
      ${rows.map(([label, val]) => `
        <dt style="color:var(--color-gray-500);font-weight:500">${label}</dt>
        <dd style="margin:0">${val}</dd>
      `).join('')}
    </dl>
  `;

  document.getElementById('btn-view-edit').onclick = () => {
    closeViewModal();
    editClient(clientId);
  };
  document.getElementById('btn-view-new-doc').onclick = () => {
    closeViewModal();
    newDocForClient(clientId);
  };

  document.getElementById('modal-view').classList.add('show');
}

function closeViewModal() {
  document.getElementById('modal-view').classList.remove('show');
  state.viewingId = null;
}

// ==================== ACTIONS ====================

function newDocForClient(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return;
  // Naviguer vers documents avec le client pré-sélectionné (via query string)
  const params = new URLSearchParams({ client_id: client.id, client_name: client.name });
  window.location.href = `../documents/index.html?${params}`;
}

// ==================== IMPORT / EXPORT ====================

async function handleImport() {
  const file = document.getElementById('import-file').files[0];
  if (!file) { Utils.toast('Sélectionnez un fichier JSON', 'warning'); return; }

  const btn = document.getElementById('btn-import');
  btn.disabled = true;
  btn.textContent = 'Import en cours...';

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const clients = Array.isArray(json) ? json : (json.clients ?? []);

    let imported = 0, errors = [];
    for (const c of clients) {
      const res = await window.api.clients.create(c);
      if (res.ok) imported++;
      else errors.push(`${c.name}: ${res.error}`);
    }

    const resultEl = document.getElementById('import-result');
    resultEl.className = errors.length ? 'alert alert-warning' : 'alert alert-success';
    resultEl.textContent = `${imported} client(s) importé(s).` +
      (errors.length ? ` ${errors.length} erreur(s) : ${errors.slice(0,3).join(', ')}` : '');
    resultEl.style.display = 'flex';

    if (imported > 0) { Utils.toast(`${imported} clients importés`, 'success'); await loadClients(); }
  } catch (e) {
    Utils.toast('Erreur de lecture : ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Importer';
}

async function handleExport() {
  const res = await window.api.clients.getAll();
  if (!res.ok) { Utils.toast('Erreur export', 'error'); return; }

  const data = { version: 3, exportDate: new Date().toISOString(), clients: res.data };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `clients-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Utils.toast('Export téléchargé', 'success');
}
