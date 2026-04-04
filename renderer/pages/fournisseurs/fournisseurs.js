/**
 * Fournisseurs — Logique de la page fournisseurs
 */

'use strict';

// ==================== ÉTAT ====================

let state = {
  suppliers:  [],
  editingId:  null,
  viewingId:  null,
};

// ==================== INITIALISATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupSearch();
  setupModal();
  await loadSuppliers();
});

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
  document.getElementById('btn-new-supplier')
    .addEventListener('click', () => openSupplierModal());
  document.getElementById('btn-empty-new-supplier')
    ?.addEventListener('click', () => openSupplierModal());
  document.getElementById('btn-save-supplier')
    .addEventListener('click', handleSaveSupplier);

  // Délégation sur la table fournisseurs
  document.getElementById('suppliers-tbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'view-supplier')   openViewModal(id);
    if (btn.dataset.action === 'edit-supplier')   editSupplier(id);
    if (btn.dataset.action === 'delete-supplier') confirmDeleteSupplier(id);
  });

  // Fermeture via attribut data-close-modal
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    const targetId = btn.dataset.closeModal;
    btn.addEventListener('click', () => {
      document.getElementById(targetId)?.classList.remove('show');
      if (targetId === 'modal-supplier') state.editingId = null;
      if (targetId === 'modal-view')     state.viewingId = null;
    });
  });

  // Fermeture au clic sur le fond
  ['modal-supplier', 'modal-view'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) {
        e.target.classList.remove('show');
        if (id === 'modal-supplier') state.editingId = null;
        if (id === 'modal-view')     state.viewingId = null;
      }
    });
  });
}

// ==================== DONNÉES ====================

async function loadSuppliers() {
  const res = await window.api.suppliers.getAll();
  if (!res.ok) { Utils.toast('Erreur chargement fournisseurs', 'error'); return; }
  state.suppliers = res.data;
  renderTable(res.data);
  renderStats(res.data);
}

async function handleSearch(term) {
  if (!term) { await loadSuppliers(); return; }
  const res = await window.api.suppliers.search(term);
  if (!res.ok) return;
  renderTable(res.data);
  document.getElementById('supplier-count').textContent = res.data.length;
}

// ==================== RENDU TABLE ====================

function renderTable(suppliers) {
  const tbody   = document.getElementById('suppliers-tbody');
  const empty   = document.getElementById('empty-state');
  const wrapper = document.getElementById('table-wrapper');
  const count   = document.getElementById('supplier-count');

  count.textContent = suppliers.length;
  tbody.innerHTML   = '';

  if (suppliers.length === 0) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  suppliers.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="font-bold" style="cursor:pointer;color:var(--color-primary)"
          data-action="view-supplier" data-id="${s.id}">${Utils.escapeHtml(s.name)}</div>
        ${s.city ? `<div class="text-xs text-muted">${Utils.escapeHtml([s.zip, s.city].filter(Boolean).join(' '))}</div>` : ''}
      </td>
      <td style="font-size:13px">
        ${s.contact
          ? `<div>${Utils.escapeHtml(s.contact)}</div>
             ${s.contact_phone ? `<div class="text-xs text-muted">${Utils.escapeHtml(s.contact_phone)}</div>` : ''}`
          : '<span class="text-muted">—</span>'}
      </td>
      <td style="font-size:13px">
        ${s.commercial_name
          ? `<div>${Utils.escapeHtml(s.commercial_name)}</div>
             ${s.commercial_phone ? `<div class="text-xs text-muted">${Utils.escapeHtml(s.commercial_phone)}</div>` : ''}`
          : '<span class="text-muted">—</span>'}
      </td>
      <td style="font-size:13px">
        ${s.sav_name
          ? `<div>${Utils.escapeHtml(s.sav_name)}</div>
             ${s.sav_phone ? `<div class="text-xs text-muted">${Utils.escapeHtml(s.sav_phone)}</div>` : ''}`
          : '<span class="text-muted">—</span>'}
      </td>
      <td style="font-size:13px">${s.phone || '<span class="text-muted">—</span>'}</td>
      <td style="text-align:right">
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm btn-icon" title="Voir la fiche"
            data-action="view-supplier" data-id="${s.id}">👁</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Modifier"
            data-action="edit-supplier" data-id="${s.id}">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Supprimer"
            data-action="delete-supplier" data-id="${s.id}">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStats(suppliers) {
  document.getElementById('stat-total').textContent          = suppliers.length;
  document.getElementById('stat-with-commercial').textContent = suppliers.filter(s => s.commercial_name).length;
  document.getElementById('stat-with-sav').textContent        = suppliers.filter(s => s.sav_name).length;
  document.getElementById('stat-with-contact').textContent    = suppliers.filter(s => s.contact).length;
}

// ==================== MODAL ÉDITION ====================

function openSupplierModal(supplier = null) {
  state.editingId = supplier ? supplier.id : null;

  const fields = {
    'f-name':             supplier?.name             ?? '',
    'f-phone':            supplier?.phone            ?? '',
    'f-email':            supplier?.email            ?? '',
    'f-address':          supplier?.address          ?? '',
    'f-zip':              supplier?.zip              ?? '',
    'f-city':             supplier?.city             ?? '',
    'f-contact':          supplier?.contact          ?? '',
    'f-contact-phone':    supplier?.contact_phone    ?? '',
    'f-contact-email':    supplier?.contact_email    ?? '',
    'f-commercial-name':  supplier?.commercial_name  ?? '',
    'f-commercial-phone': supplier?.commercial_phone ?? '',
    'f-commercial-email': supplier?.commercial_email ?? '',
    'f-sav-name':         supplier?.sav_name         ?? '',
    'f-sav-phone':        supplier?.sav_phone        ?? '',
    'f-sav-email':        supplier?.sav_email        ?? '',
    'f-delivery-weeks':   supplier?.delivery_weeks   ?? '',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  document.getElementById('modal-supplier-title').textContent =
    supplier ? `Modifier : ${supplier.name}` : 'Nouveau fournisseur';
  document.getElementById('btn-save-supplier').textContent =
    supplier ? 'Mettre à jour' : 'Enregistrer';

  document.getElementById('modal-error').style.display = 'none';
  document.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

  document.getElementById('modal-supplier').classList.add('show');
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

function closeSupplierModal() {
  document.getElementById('modal-supplier').classList.remove('show');
  state.editingId = null;
}

function editSupplier(supplierId) {
  const supplier = state.suppliers.find(s => s.id === supplierId);
  if (supplier) openSupplierModal(supplier);
}

async function handleSaveSupplier() {
  const name = document.getElementById('f-name').value.trim();

  if (!name) {
    document.getElementById('f-name').classList.add('error');
    document.getElementById('err-name').style.display = 'block';
    return;
  }
  document.getElementById('f-name').classList.remove('error');
  document.getElementById('err-name').style.display = 'none';

  const data = {
    name,
    phone:            document.getElementById('f-phone').value.trim(),
    email:            document.getElementById('f-email').value.trim(),
    address:          document.getElementById('f-address').value.trim(),
    zip:              document.getElementById('f-zip').value.trim(),
    city:             document.getElementById('f-city').value.trim(),
    contact:          document.getElementById('f-contact').value.trim(),
    contact_phone:    document.getElementById('f-contact-phone').value.trim(),
    contact_email:    document.getElementById('f-contact-email').value.trim(),
    commercial_name:  document.getElementById('f-commercial-name').value.trim(),
    commercial_phone: document.getElementById('f-commercial-phone').value.trim(),
    commercial_email: document.getElementById('f-commercial-email').value.trim(),
    sav_name:         document.getElementById('f-sav-name').value.trim(),
    sav_phone:        document.getElementById('f-sav-phone').value.trim(),
    sav_email:        document.getElementById('f-sav-email').value.trim(),
    delivery_weeks:   document.getElementById('f-delivery-weeks').value.trim(),
  };

  const btn = document.getElementById('btn-save-supplier');
  btn.disabled = true;

  let res;
  if (state.editingId) {
    res = await window.api.suppliers.update(state.editingId, data);
  } else {
    res = await window.api.suppliers.create(data);
  }

  btn.disabled = false;

  if (!res.ok) {
    const errEl = document.getElementById('modal-error');
    errEl.textContent = res.errors?.join('\n') || res.error;
    errEl.style.display = 'flex';
    return;
  }

  closeSupplierModal();
  Utils.toast(state.editingId ? 'Fournisseur mis à jour' : 'Fournisseur créé', 'success');
  await loadSuppliers();
}

// ==================== MODAL FICHE ====================

function openViewModal(supplierId) {
  const s = state.suppliers.find(sup => sup.id === supplierId);
  if (!s) return;

  state.viewingId = supplierId;
  document.getElementById('view-supplier-name').textContent = s.name;

  const esc = v => Utils.escapeHtml(String(v || ''));
  const tel = (phone, email) => [
    phone ? `📞 ${esc(phone)}` : '',
    email ? `✉ <a href="mailto:${esc(email)}" style="color:var(--color-primary)">${esc(email)}</a>` : '',
  ].filter(Boolean).join('  ');

  const sections = [];

  // Infos générales
  const generalRows = [];
  if (s.phone || s.email) generalRows.push(['Téléphone / Email', tel(s.phone, s.email)]);
  if (s.address || s.city) {
    const addr = [s.address, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');
    generalRows.push(['Adresse', addr]);
  }
  if (generalRows.length) {
    sections.push({ title: 'Informations générales', rows: generalRows });
  }

  // Contact régulier
  if (s.contact || s.contact_phone || s.contact_email) {
    const rows = [];
    if (s.contact) rows.push(['Nom', esc(s.contact)]);
    if (s.contact_phone || s.contact_email) rows.push(['Contact', tel(s.contact_phone, s.contact_email)]);
    sections.push({ title: 'Contact régulier', rows });
  }

  // Commercial
  if (s.commercial_name || s.commercial_phone || s.commercial_email) {
    const rows = [];
    if (s.commercial_name) rows.push(['Nom', esc(s.commercial_name)]);
    if (s.commercial_phone || s.commercial_email) rows.push(['Contact', tel(s.commercial_phone, s.commercial_email)]);
    sections.push({ title: 'Commercial', rows });
  }

  // SAV
  if (s.sav_name || s.sav_phone || s.sav_email) {
    const rows = [];
    if (s.sav_name) rows.push(['Nom', esc(s.sav_name)]);
    if (s.sav_phone || s.sav_email) rows.push(['Contact', tel(s.sav_phone, s.sav_email)]);
    sections.push({ title: 'Contact SAV', rows });
  }

  document.getElementById('view-supplier-body').innerHTML = sections.map(sec => `
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--color-gray-400);margin-bottom:8px">
        ${sec.title}
      </div>
      <dl style="display:grid;grid-template-columns:130px 1fr;gap:8px 16px;font-size:13px">
        ${sec.rows.map(([label, val]) => `
          <dt style="color:var(--color-gray-500);font-weight:500">${label}</dt>
          <dd style="margin:0">${val}</dd>
        `).join('')}
      </dl>
    </div>
  `).join('<hr style="border:none;border-top:1px solid var(--color-gray-100);margin:0 0 16px">') || `
    <p style="color:var(--color-gray-400);font-size:13px">Aucune information renseignée.</p>
  `;

  document.getElementById('btn-view-edit').onclick = () => {
    document.getElementById('modal-view').classList.remove('show');
    state.viewingId = null;
    editSupplier(supplierId);
  };

  document.getElementById('modal-view').classList.add('show');
}

// ==================== SUPPRESSION ====================

async function confirmDeleteSupplier(supplierId) {
  const supplier = state.suppliers.find(s => s.id === supplierId);
  if (!supplier) return;

  const confirmed = window.confirm(
    `Supprimer le fournisseur "${supplier.name}" ?\n\nCette action est irréversible.`
  );
  if (!confirmed) return;

  const res = await window.api.suppliers.remove(supplierId);
  if (!res.ok) {
    Utils.toast(res.error || 'Erreur lors de la suppression', 'error');
    return;
  }

  Utils.toast('Fournisseur supprimé', 'success');
  await loadSuppliers();
}
