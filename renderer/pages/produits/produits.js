/**
 * Produits — Logique de la page catalogue
 * Toutes les interactions passent par window.api.*
 */

'use strict';

// ==================== ÉTAT LOCAL ====================

let state = {
  products:       [],
  editingId:      null,
  editingRanges:  [],
  editingModules: [],
  editingOptions: [],
  editingRangeIdx:  null,
  editingModuleIdx: null,
  editingOptionIdx: null,
  editingPhoto:     null,        // data URL ou '' pour supprimer
  confirmCallback:  null,
  currentView:    'list',
};

// ==================== INITIALISATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupSearch();
  setupProductModal();
  setupSubModals();
  setupImportExport();
  setupPhotoUpload();
  await loadProducts();
  await loadSuppliers();
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

function setupProductModal() {
  document.getElementById('btn-new-product')
    .addEventListener('click', openProductModal);
  document.getElementById('btn-save-product')
    .addEventListener('click', handleSaveProduct);

  // Close buttons for modal-product
  document.getElementById('btn-empty-new-product')
    ?.addEventListener('click', () => openProductModal());

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Auto-génération de l'ID depuis le nom
  document.getElementById('f-name').addEventListener('input', e => {
    const idField = document.getElementById('f-id');
    if (!state.editingId && !idField.dataset.manuallyEdited) {
      idField.value = Utils.slugify(e.target.value);
    }
  });

  document.getElementById('f-id').addEventListener('input', e => {
    if (e.target.value) e.target.dataset.manuallyEdited = '1';
    else delete e.target.dataset.manuallyEdited;
  });
}

function setupSubModals() {
  document.getElementById('btn-add-range')
    .addEventListener('click', () => openRangeModal());
  document.getElementById('btn-add-module')
    .addEventListener('click', () => openModuleModal());
  document.getElementById('btn-add-option')
    .addEventListener('click', () => openOptionModal());

  document.getElementById('btn-confirm-range')
    .addEventListener('click', handleSaveRange);
  document.getElementById('btn-confirm-module')
    .addEventListener('click', handleSaveModule);
  document.getElementById('btn-confirm-option')
    .addEventListener('click', handleSaveOption);

  // Fermer les modals internes sans fermer la modal principale
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        const id = backdrop.id;
        if (id === 'modal-range')   closeRangeModal();
        else if (id === 'modal-module') closeModuleModal();
        else if (id === 'modal-option') closeOptionModal();
        else if (id === 'modal-confirm') closeConfirm();
        // modal-product : ne pas fermer au clic extérieur (perte de données)
      }
    });
  });

  // Universal modal close via data-close-modal
  const closeActions = {
    'modal-product': closeProductModal,
    'modal-range':   closeRangeModal,
    'modal-module':  closeModuleModal,
    'modal-option':  closeOptionModal,
    'modal-confirm': closeConfirm,
  };
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    const fn = closeActions[btn.dataset.closeModal];
    if (fn) btn.addEventListener('click', fn);
  });

  // Event delegation — products table
  document.getElementById('products-tbody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id, name } = btn.dataset;
    if (action === 'edit')      editProduct(id);
    if (action === 'duplicate') duplicateProduct(id);
    if (action === 'archive')   confirmArchive(id, name);
  });
  document.getElementById('products-tbody').addEventListener('change', e => {
    const cb = e.target.closest('input[data-product-id]');
    if (cb) toggleProductActive(cb.dataset.productId, cb.checked);
  });

  // Event delegation — archived table
  document.getElementById('archived-tbody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'restore') restoreProduct(btn.dataset.id);
  });

  // Event delegation — ranges list
  document.getElementById('ranges-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (btn.dataset.action === 'edit-range')   openRangeModal(idx);
    if (btn.dataset.action === 'delete-range') deleteRange(idx);
  });

  // Event delegation — modules list
  document.getElementById('modules-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (btn.dataset.action === 'edit-module')   openModuleModal(idx);
    if (btn.dataset.action === 'delete-module') deleteModule(idx);
  });

  // Event delegation — options list
  document.getElementById('options-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (btn.dataset.action === 'edit-option')   openOptionModal(idx);
    if (btn.dataset.action === 'delete-option') deleteOption(idx);
  });
}

function setupImportExport() {
  document.getElementById('btn-import')
    .addEventListener('click', handleImport);
  document.getElementById('btn-export-json')
    .addEventListener('click', handleExportJson);
  document.getElementById('btn-import-csv')
    .addEventListener('click', handleImportCsv);
  document.getElementById('btn-csv-template')
    .addEventListener('click', downloadCsvTemplate);
}

function setupPhotoUpload() {
  const input = document.getElementById('f-photo');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      Utils.toast('Image trop volumineuse (max 2 Mo)', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      state.editingPhoto = e.target.result;
      showPhotoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
  });
  document.getElementById('btn-delete-photo').addEventListener('click', () => {
    state.editingPhoto = '';
    document.getElementById('photo-preview-wrap').style.display = 'none';
  });
}

// ==================== NAVIGATION VUES ====================

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

  const el = document.getElementById(`view-${view}`);
  if (el) el.style.display = 'block';

  const nav = document.querySelector(`[data-view="${view}"]`);
  if (nav) nav.classList.add('active');

  state.currentView = view;

  const titles = {
    list:         'Catalogue produits',
    archived:     'Produits archivés',
    import:       'Importer un catalogue',
    'import-csv': 'Importer CSV fournisseur',
    export:       'Exporter le catalogue',
  };
  document.getElementById('page-title').textContent = titles[view] || 'Produits';

  const newBtn = document.getElementById('btn-new-product');
  const searchWrapper = document.querySelector('.search-wrapper');
  newBtn.style.display = view === 'list' ? 'inline-flex' : 'none';
  searchWrapper.style.display = view === 'list' ? 'flex' : 'none';

  if (view === 'archived') loadArchivedProducts();
}

// ==================== CHARGEMENT DONNÉES ====================

async function loadProducts() {
  const res = await window.api.products.getAll();
  if (!res.ok) { Utils.toast('Erreur chargement produits', 'error'); return; }
  state.products = res.data;
  renderProductsTable(state.products);
  renderStats(state.products);
}

async function loadArchivedProducts() {
  const res = await window.api.products.getAllArchived();
  if (!res.ok) { Utils.toast('Erreur chargement archivés', 'error'); return; }

  const products = res.data;
  const empty = document.getElementById('archived-empty');
  const table = document.getElementById('archived-table');
  const tbody = document.getElementById('archived-tbody');

  if (products.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  table.style.display = 'table';
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>
        <div class="font-bold">${Utils.escapeHtml(p.name)}</div>
        <div class="text-xs text-muted">${Utils.escapeHtml(p.id)}</div>
      </td>
      <td>${p.supplier_name ? Utils.escapeHtml(p.supplier_name) : '<span class="text-muted">—</span>'}</td>
      <td>${p.collection ? Utils.escapeHtml(p.collection) : '<span class="text-muted">—</span>'}</td>
      <td style="text-align:right">
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" data-action="restore" data-id="${p.id}">Restaurer</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadSuppliers() {
  const res = await window.api.suppliers.getAll();
  if (!res.ok) return;
  const datalist = document.getElementById('suppliers-list');
  datalist.innerHTML = '';
  res.data.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    datalist.appendChild(opt);
  });
}

// ==================== AFFICHAGE TABLE ====================

function renderProductsTable(products) {
  const tbody   = document.getElementById('products-tbody');
  const empty   = document.getElementById('empty-state');
  const wrapper = document.getElementById('table-wrapper');
  const count   = document.getElementById('product-count');

  count.textContent = products.length;
  tbody.innerHTML = '';

  if (products.length === 0) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  products.forEach(product => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <label class="toggle" title="${product.active ? 'Actif' : 'Inactif'}">
          <input type="checkbox" ${product.active ? 'checked' : ''}
            data-product-id="${product.id}">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td style="padding:4px 6px">
        ${product.photo
          ? `<img src="${product.photo}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--color-border)">`
          : '<div style="width:36px;height:36px;background:#f1f5f9;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>'}
      </td>
      <td>
        <div class="font-bold">${Utils.escapeHtml(product.name)}</div>
        <div class="text-xs text-muted">${Utils.escapeHtml(product.id)}</div>
      </td>
      <td>${product.supplier_name ? Utils.escapeHtml(product.supplier_name) : '<span class="text-muted">—</span>'}</td>
      <td>${product.collection ? Utils.escapeHtml(product.collection) : '<span class="text-muted">—</span>'}</td>
      <td style="text-align:center">
        <span class="badge badge-primary">${product.ranges?.length ?? 0}</span>
      </td>
      <td style="text-align:center">
        <span class="badge badge-primary">${product.modules?.length ?? 0}</span>
      </td>
      <td style="text-align:center">
        <span class="badge badge-gray">${product.options?.length ?? 0}</span>
      </td>
      <td style="text-align:center">
        ${product.active
          ? '<span class="badge badge-success">Actif</span>'
          : '<span class="badge badge-gray">Inactif</span>'}
      </td>
      <td style="text-align:right">
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm btn-icon" title="Éditer"
            data-action="edit" data-id="${product.id}">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Dupliquer"
            data-action="duplicate" data-id="${product.id}">📋</button>
          <button class="btn btn-ghost btn-sm btn-icon" title="Archiver"
            data-action="archive" data-id="${product.id}" data-name="${Utils.escapeHtml(product.name)}">🗄</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStats(products) {
  const suppliers = new Set(products.map(p => p.supplier_name).filter(Boolean));
  const totalRanges  = products.reduce((s, p) => s + (p.ranges?.length  ?? 0), 0);
  const totalModules = products.reduce((s, p) => s + (p.modules?.length ?? 0), 0);

  document.getElementById('stat-total').textContent     = products.filter(p => p.active).length;
  document.getElementById('stat-suppliers').textContent = suppliers.size;
  document.getElementById('stat-ranges').textContent    = totalRanges;
  document.getElementById('stat-modules').textContent   = totalModules;
}

// ==================== RECHERCHE ====================

async function handleSearch(term) {
  if (!term) { await loadProducts(); return; }
  const res = await window.api.products.search(term);
  if (!res.ok) return;
  renderProductsTable(res.data);
  document.getElementById('product-count').textContent = res.data.length;
}

// ==================== MODAL PRODUIT ====================

function openProductModal(product = null) {
  state.editingId      = product ? product.id : null;
  state.editingRanges  = product ? Utils.deepClone(product.ranges)  : [];
  state.editingModules = product ? Utils.deepClone(product.modules) : [];
  state.editingOptions = product ? Utils.deepClone(product.options) : [];

  // Reset champs
  document.getElementById('f-id').value          = product?.id          ?? '';
  document.getElementById('f-name').value         = product?.name        ?? '';
  document.getElementById('f-supplier').value     = product?.supplier_name ?? '';
  document.getElementById('f-collection').value   = product?.collection  ?? '';
  document.getElementById('f-valid-from').value   = product?.valid_from  ?? '';
  document.getElementById('f-valid-until').value  = product?.valid_until ?? '';
  document.getElementById('f-description').value     = product?.description     ?? '';
  document.getElementById('f-supplier-notes').value  = product?.supplier_notes  ?? '';
  document.getElementById('f-coefficient').value     = product?.purchase_coefficient ?? 2.0;

  // Photo
  state.editingPhoto = product?.photo ?? '';
  if (state.editingPhoto) {
    showPhotoPreview(state.editingPhoto);
  } else {
    document.getElementById('photo-preview-wrap').style.display = 'none';
  }
  const rounding = product?.price_rounding ?? 'none';
  document.querySelectorAll('input[name="price-rounding"]').forEach(radio => {
    radio.checked = radio.value === rounding;
  });

  delete document.getElementById('f-id').dataset.manuallyEdited;
  if (product) document.getElementById('f-id').dataset.manuallyEdited = '1';

  document.getElementById('modal-product-title').textContent =
    product ? `Éditer : ${product.name}` : 'Nouveau produit';

  hideAllErrors();
  document.getElementById('modal-error').style.display = 'none';

  switchTab('general');
  renderNestedLists();
  document.getElementById('modal-product').classList.add('show');

  // Focus premier champ
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

function closeProductModal() {
  document.getElementById('modal-product').classList.remove('show');
  state.editingId = null;
}

async function editProduct(productId) {
  const res = await window.api.products.getById(productId);
  if (!res.ok || !res.data) {
    Utils.toast('Produit non trouvé', 'error');
    return;
  }
  openProductModal(res.data);
}

async function handleSaveProduct() {
  const id         = document.getElementById('f-id').value.trim();
  const name       = document.getElementById('f-name').value.trim();
  const supplierName = document.getElementById('f-supplier').value.trim();
  const collection = document.getElementById('f-collection').value.trim();
  const validFrom  = document.getElementById('f-valid-from').value || null;
  const validUntil = document.getElementById('f-valid-until').value || null;
  const description   = document.getElementById('f-description').value.trim();
  const purchase_coefficient = parseFloat(document.getElementById('f-coefficient').value) || 2.0;
  const price_rounding = document.querySelector('input[name="price-rounding"]:checked')?.value ?? 'none';

  // Validation UI
  let valid = true;
  if (!id)   { showError('err-id',   'ID obligatoire');   valid = false; }
  else        { hideError('err-id'); }
  if (!name)  { showError('err-name', 'Nom obligatoire');  valid = false; }
  else        { hideError('err-name'); }

  if (state.editingRanges.length === 0) {
    showError('err-ranges', 'Au moins une gamme est requise');
    switchTab('ranges');
    valid = false;
  } else { hideError('err-ranges'); }

  if (state.editingModules.length === 0) {
    showError('err-modules', 'Au moins un module est requis');
    if (valid) switchTab('modules'); // ne pas sauter si déjà sur ranges
    valid = false;
  } else { hideError('err-modules'); }

  if (!valid) return;

  // Résolution fournisseur
  let supplier_id = null;
  if (supplierName) {
    const supRes = await window.api.suppliers.findOrCreate(supplierName);
    if (supRes.ok && supRes.data) supplier_id = supRes.data.id;
  }

  const supplier_notes = document.getElementById('f-supplier-notes').value.trim();

  const productData = {
    id, name, supplier_id,
    collection, description,
    supplier_notes,
    purchase_coefficient,
    price_rounding,
    valid_from:  validFrom,
    valid_until: validUntil,
    photo:   state.editingPhoto ?? '',
    ranges:  state.editingRanges,
    modules: state.editingModules,
    options: state.editingOptions,
  };

  const btn = document.getElementById('btn-save-product');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  let res;
  if (state.editingId) {
    res = await window.api.products.update(state.editingId, productData);
  } else {
    res = await window.api.products.create(productData);
  }

  btn.disabled = false;
  btn.textContent = 'Enregistrer';

  if (!res.ok) {
    const errEl = document.getElementById('modal-error');
    errEl.textContent = res.errors?.join('\n') || res.error;
    errEl.style.display = 'flex';
    return;
  }

  closeProductModal();
  Utils.toast(state.editingId ? 'Produit mis à jour' : 'Produit créé', 'success');
  await loadProducts();
  await loadSuppliers();
}

// ==================== TOGGLE ACTIF ====================

async function toggleProductActive(productId, active) {
  const res = await window.api.products.setActive(productId, active);
  if (!res.ok) {
    Utils.toast('Erreur lors de la mise à jour', 'error');
    await loadProducts(); // Revert
    return;
  }
  // Mettre à jour le badge sans recharger toute la table
  renderStats(state.products.map(p =>
    p.id === productId ? { ...p, active: active ? 1 : 0 } : p
  ));
}

// ==================== RESTAURATION ====================

async function restoreProduct(productId) {
  const res = await window.api.products.restore(productId);
  if (!res.ok) { Utils.toast(res.error, 'error'); return; }
  Utils.toast('Produit restauré', 'success');
  await loadArchivedProducts();
  await loadProducts();
}

// ==================== DUPLICATION ====================

async function duplicateProduct(productId) {
  const res = await window.api.products.duplicate(productId);
  if (!res.ok) { Utils.toast(res.error, 'error'); return; }
  Utils.toast('Produit dupliqué', 'success');
  await loadProducts();
}

// ==================== ARCHIVAGE ====================

function confirmArchive(productId, productName) {
  openConfirm(
    'Archiver ce produit',
    `Archiver "${productName}" ? Il ne sera plus visible dans le configurateur mais restera dans l'historique des documents.`,
    async () => {
      const res = await window.api.products.archive(productId);
      if (!res.ok) { Utils.toast(res.error, 'error'); return; }
      Utils.toast('Produit archivé', 'success');
      await loadProducts();
    }
  );
}

// ==================== ONGLETS FORMULAIRE ====================

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
}

// ==================== GAMMES ====================

function openRangeModal(idx = null) {
  state.editingRangeIdx = idx;
  const range = idx !== null ? state.editingRanges[idx] : null;

  document.getElementById('r-id').value    = range?.id         ?? '';
  document.getElementById('r-name').value  = range?.name       ?? '';
  document.getElementById('r-price').value = range?.base_price ?? '';
  document.getElementById('r-id').disabled = idx !== null; // ID non modifiable en édition

  ['r-id','r-name','r-price'].forEach(id => {
    document.getElementById(id).classList.remove('error');
  });
  ['err-r-id','err-r-name','err-r-price'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  document.getElementById('btn-confirm-range').textContent =
    idx !== null ? 'Mettre à jour' : 'Ajouter';

  document.getElementById('modal-range').classList.add('show');
  setTimeout(() => document.getElementById('r-name').focus(), 50);
}

function closeRangeModal() {
  document.getElementById('modal-range').classList.remove('show');
  state.editingRangeIdx = null;
}

function handleSaveRange() {
  const id    = document.getElementById('r-id').value.trim();
  const name  = document.getElementById('r-name').value.trim();
  const price = parseFloat(document.getElementById('r-price').value);

  let valid = true;
  if (!id)          { showFieldError('r-id',    'err-r-id',    'ID obligatoire');    valid = false; }
  else               { clearFieldError('r-id',   'err-r-id'); }
  if (!name)        { showFieldError('r-name',  'err-r-name',  'Nom obligatoire');   valid = false; }
  else               { clearFieldError('r-name', 'err-r-name'); }
  if (isNaN(price) || price < 0) {
    showFieldError('r-price', 'err-r-price', 'Prix invalide (≥ 0)');
    valid = false;
  } else { clearFieldError('r-price', 'err-r-price'); }

  if (!valid) return;

  // Doublon ID (sauf en édition)
  if (state.editingRangeIdx === null) {
    if (state.editingRanges.some(r => r.id === id)) {
      showFieldError('r-id', 'err-r-id', 'Cet ID existe déjà');
      return;
    }
    state.editingRanges.push({ id, name, base_price: price });
  } else {
    state.editingRanges[state.editingRangeIdx] = {
      ...state.editingRanges[state.editingRangeIdx], name, base_price: price
    };
  }

  renderNestedLists();
  closeRangeModal();
}

function deleteRange(idx) {
  const range = state.editingRanges[idx];
  // Nettoyer les prix de modules associés
  state.editingModules.forEach(m => {
    delete m.prices[range.id];
  });
  state.editingRanges.splice(idx, 1);
  renderNestedLists();
}

// ==================== MODULES ====================

function openModuleModal(idx = null) {
  if (state.editingRanges.length === 0) {
    Utils.toast('Ajoutez au moins une gamme avant de créer un module', 'warning');
    switchTab('ranges');
    return;
  }

  state.editingModuleIdx = idx;
  const module = idx !== null ? state.editingModules[idx] : null;

  document.getElementById('m-id').value   = module?.id          ?? '';
  document.getElementById('m-name').value = module?.name        ?? '';
  document.getElementById('m-desc').value = module?.description ?? '';
  document.getElementById('m-id').disabled = idx !== null;

  // Générer les inputs prix par gamme
  const pricesDiv = document.getElementById('module-prices');
  pricesDiv.innerHTML = '';
  state.editingRanges.forEach(range => {
    const currentPrice = module?.prices?.[range.id] ?? '';
    pricesDiv.innerHTML += `
      <div class="form-row" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:13px;color:var(--color-gray-600);min-width:120px">
            ${Utils.escapeHtml(range.name)}
          </label>
          <input type="number" class="form-control module-price-input"
            data-range-id="${range.id}"
            value="${currentPrice}" min="0" step="0.01"
            placeholder="0.00" style="max-width:120px">
        </div>
      </div>
    `;
  });

  document.getElementById('err-m-prices').style.display = 'none';
  ['m-id','m-name'].forEach(id => document.getElementById(id).classList.remove('error'));
  ['err-m-id','err-m-name'].forEach(id => document.getElementById(id).style.display = 'none');

  document.getElementById('btn-confirm-module').textContent =
    idx !== null ? 'Mettre à jour' : 'Ajouter';

  document.getElementById('modal-module').classList.add('show');
  setTimeout(() => document.getElementById('m-name').focus(), 50);
}

function closeModuleModal() {
  document.getElementById('modal-module').classList.remove('show');
  state.editingModuleIdx = null;
}

function handleSaveModule() {
  const id   = document.getElementById('m-id').value.trim();
  const name = document.getElementById('m-name').value.trim();
  const desc = document.getElementById('m-desc').value.trim();

  let valid = true;
  if (!id)   { showFieldError('m-id',   'err-m-id',   'ID obligatoire');  valid = false; }
  else        { clearFieldError('m-id',  'err-m-id'); }
  if (!name) { showFieldError('m-name', 'err-m-name', 'Nom obligatoire'); valid = false; }
  else        { clearFieldError('m-name','err-m-name'); }

  if (state.editingModuleIdx === null) {
    if (state.editingModules.some(m => m.id === id)) {
      showFieldError('m-id', 'err-m-id', 'Cet ID existe déjà');
      return;
    }
  }

  // Collecter les prix
  const prices = {};
  document.querySelectorAll('.module-price-input').forEach(input => {
    const rangeId = input.dataset.rangeId;
    const price = parseFloat(input.value);
    prices[rangeId] = isNaN(price) ? 0 : price;
  });

  if (!valid) return;

  const moduleData = { id, name, description: desc, prices };

  if (state.editingModuleIdx === null) {
    state.editingModules.push(moduleData);
  } else {
    state.editingModules[state.editingModuleIdx] = {
      ...state.editingModules[state.editingModuleIdx],
      name, description: desc, prices
    };
  }

  renderNestedLists();
  closeModuleModal();
}

function deleteModule(idx) {
  state.editingModules.splice(idx, 1);
  renderNestedLists();
}

// ==================== OPTIONS ====================

function openOptionModal(idx = null) {
  state.editingOptionIdx = idx;
  const option = idx !== null ? state.editingOptions[idx] : null;

  document.getElementById('o-id').value    = option?.id          ?? '';
  document.getElementById('o-name').value  = option?.name        ?? '';
  document.getElementById('o-price').value = option?.price       ?? '';
  document.getElementById('o-type').value  = option?.type        ?? '';
  document.getElementById('o-desc').value  = option?.description ?? '';
  document.getElementById('o-id').disabled = idx !== null;

  ['o-id','o-name','o-price'].forEach(id => document.getElementById(id).classList.remove('error'));
  ['err-o-id','err-o-name','err-o-price'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  document.getElementById('btn-confirm-option').textContent =
    idx !== null ? 'Mettre à jour' : 'Ajouter';

  document.getElementById('modal-option').classList.add('show');
  setTimeout(() => document.getElementById('o-name').focus(), 50);
}

function closeOptionModal() {
  document.getElementById('modal-option').classList.remove('show');
  state.editingOptionIdx = null;
}

function handleSaveOption() {
  const id    = document.getElementById('o-id').value.trim();
  const name  = document.getElementById('o-name').value.trim();
  const price = parseFloat(document.getElementById('o-price').value);
  const type  = document.getElementById('o-type').value;
  const desc  = document.getElementById('o-desc').value.trim();

  let valid = true;
  if (!id)          { showFieldError('o-id',    'err-o-id',    'ID obligatoire');   valid = false; }
  else               { clearFieldError('o-id',   'err-o-id'); }
  if (!name)        { showFieldError('o-name',  'err-o-name',  'Nom obligatoire');  valid = false; }
  else               { clearFieldError('o-name', 'err-o-name'); }
  if (isNaN(price) || price < 0) {
    showFieldError('o-price', 'err-o-price', 'Prix invalide (≥ 0)');
    valid = false;
  } else { clearFieldError('o-price', 'err-o-price'); }

  if (!valid) return;

  if (state.editingOptionIdx === null) {
    if (state.editingOptions.some(o => o.id === id)) {
      showFieldError('o-id', 'err-o-id', 'Cet ID existe déjà');
      return;
    }
    state.editingOptions.push({ id, name, price, type, description: desc });
  } else {
    state.editingOptions[state.editingOptionIdx] = {
      ...state.editingOptions[state.editingOptionIdx],
      name, price, type, description: desc
    };
  }

  renderNestedLists();
  closeOptionModal();
}

function deleteOption(idx) {
  state.editingOptions.splice(idx, 1);
  renderNestedLists();
}

// ==================== RENDU LISTES IMBRIQUÉES ====================

function renderNestedLists() {
  renderRangesList();
  renderModulesList();
  renderOptionsList();
  updateTabCounts();
}

function renderRangesList() {
  const list = document.getElementById('ranges-list');
  if (state.editingRanges.length === 0) {
    list.innerHTML = '<div class="nested-empty">Aucune gamme. Ajoutez-en au moins une.</div>';
    return;
  }
  list.innerHTML = state.editingRanges.map((r, idx) => `
    <div class="nested-item">
      <div class="nested-item-info">
        <div class="nested-item-name">${Utils.escapeHtml(r.name)}</div>
        <div class="nested-item-meta">ID: ${Utils.escapeHtml(r.id)} · Base: ${Utils.formatPrice(r.base_price)}</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm btn-icon" data-action="edit-range" data-idx="${idx}" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-range" data-idx="${idx}" title="Supprimer"
          style="color:var(--color-danger)">✕</button>
      </div>
    </div>
  `).join('');
}

function renderModulesList() {
  const list = document.getElementById('modules-list');
  if (state.editingModules.length === 0) {
    list.innerHTML = `<div class="nested-empty">${
      state.editingRanges.length === 0
        ? 'Définissez d\'abord une gamme.'
        : 'Aucun module. Ajoutez-en au moins un.'
    }</div>`;
    return;
  }
  list.innerHTML = state.editingModules.map((m, idx) => {
    const pricesSummary = Object.entries(m.prices || {})
      .map(([rid, p]) => {
        const range = state.editingRanges.find(r => r.id === rid);
        return `${range?.name ?? rid}: ${Utils.formatPrice(p)}`;
      }).join(' · ');
    return `
      <div class="nested-item">
        <div class="nested-item-info">
          <div class="nested-item-name">${Utils.escapeHtml(m.name)}</div>
          <div class="nested-item-meta">${pricesSummary || 'Aucun tarif'}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="edit-module" data-idx="${idx}" title="Modifier">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-module" data-idx="${idx}" title="Supprimer"
            style="color:var(--color-danger)">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderOptionsList() {
  const list = document.getElementById('options-list');
  const typeLabels = { finish: 'Finition', addon: 'Ajout', accessory: 'Accessoire' };
  if (state.editingOptions.length === 0) {
    list.innerHTML = '<div class="nested-empty">Aucune option (facultatif).</div>';
    return;
  }
  list.innerHTML = state.editingOptions.map((o, idx) => `
    <div class="nested-item">
      <div class="nested-item-info">
        <div class="nested-item-name">${Utils.escapeHtml(o.name)}</div>
        <div class="nested-item-meta">
          ${Utils.formatPrice(o.price)}
          ${o.type ? ` · ${typeLabels[o.type] ?? o.type}` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm btn-icon" data-action="edit-option" data-idx="${idx}" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-option" data-idx="${idx}" title="Supprimer"
          style="color:var(--color-danger)">✕</button>
      </div>
    </div>
  `).join('');
}

function updateTabCounts() {
  document.getElementById('tab-count-ranges').textContent  = state.editingRanges.length;
  document.getElementById('tab-count-modules').textContent = state.editingModules.length;
  document.getElementById('tab-count-options').textContent = state.editingOptions.length;
}

// ==================== CONFIRMATION GÉNÉRIQUE ====================

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

document.getElementById('btn-confirm-action').addEventListener('click', () => {
  if (state.confirmCallback) state.confirmCallback();
  closeConfirm();
});

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

    // Compatibilité V1/V2 : { products: [...] } ou tableau direct
    const products = Array.isArray(json) ? json : (json.products ?? []);

    let imported = 0, errors = [];

    for (const p of products) {
      try {
        // Normaliser le format V1/V2 vers V3
        const normalized = normalizeProductFromV2(p);
        const res = await window.api.products.create(normalized);
        if (res.ok) imported++;
        else errors.push(`${p.id || p.name}: ${res.error}`);
      } catch (err) {
        errors.push(`${p.id || p.name}: ${err.message}`);
      }
    }

    const resultEl = document.getElementById('import-result');
    resultEl.className = errors.length ? 'alert alert-warning' : 'alert alert-success';
    resultEl.innerHTML = `<strong>${imported} produit(s) importé(s).</strong>` +
      (errors.length ? `<br><strong style="color:#b91c1c">${errors.length} erreur(s):</strong><ul style="margin:8px 0 0 20px">` + 
        errors.map(e => `<li style="font-size:12px">${e}</li>`).join('') + `</ul>` : '');
    resultEl.style.display = 'block';

    if (imported > 0) {
      Utils.toast(`${imported} produits importés`, 'success');
      await loadProducts();
    }
  } catch (e) {
    Utils.toast('Erreur de lecture du fichier: ' + e.message, 'error');
    console.error('Import error:', e);
  }

  btn.disabled = false;
  btn.textContent = 'Importer';
}

/**
 * Convertit un produit au format V2 (priceByRange) vers V3 (prices)
 */
function normalizeProductFromV2(p) {
  const ranges = (p.ranges || []).map(r => ({
    id: r.id,
    name: r.name,
    base_price: r.basePrice ?? r.base_price ?? 0,
  }));

  const modules = (p.modules || []).map(m => ({
    id: m.id,
    name: m.name,
    description: m.description || '',
    prices: m.priceByRange || m.prices || {},
  }));

  const options = (p.options || []).map(o => ({
    id: o.id,
    name: o.name,
    description: o.description || '',
    price: o.price ?? 0,
    type: o.type || '',
  }));

  return {
    id: p.id,
    name: p.name,
    supplier_id: null, // sera résolu via findOrCreate si nécessaire
    collection: p.collection || '',
    description: p.description || '',
    ranges, modules, options,
  };
}

async function handleExportJson() {
  const res = await window.api.products.getAll();
  if (!res.ok) { Utils.toast('Erreur export', 'error'); return; }

  const data = {
    version: 3,
    exportDate: new Date().toISOString(),
    products: res.data,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalogue-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Utils.toast('Export téléchargé', 'success');
}

// ==================== PHOTO ====================

function showPhotoPreview(dataUrl) {
  document.getElementById('photo-preview').src = dataUrl;
  document.getElementById('photo-preview-wrap').style.display = 'block';
}

// ==================== IMPORT CSV FOURNISSEUR ====================

function downloadCsvTemplate() {
  const header = 'Produit,Collection,Fournisseur,Coeff,Gamme,Prix_Gamme,Module,Prix_Module';
  const rows = [
    'Canapé 3PL,Premium 2026,Fournisseur Exemple,2.5,Tissu,0,Canapé 3 places,250',
    'Canapé 3PL,Premium 2026,Fournisseur Exemple,2.5,Cuir,0,Canapé 3 places,350',
    'Canapé 3PL,Premium 2026,Fournisseur Exemple,2.5,Tissu,0,Canapé 2 places,200',
    'Canapé 3PL,Premium 2026,Fournisseur Exemple,2.5,Cuir,0,Canapé 2 places,300',
  ];
  const csv  = [header, ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'modele-produits.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function handleImportCsv() {
  const file = document.getElementById('import-csv-file').files[0];
  if (!file) { Utils.toast('Sélectionnez un fichier CSV', 'warning'); return; }

  const btn = document.getElementById('btn-import-csv');
  btn.disabled = true; btn.textContent = 'Import en cours...';

  try {
    const text  = await file.text();
    const products = parseCsvProducts(text.replace(/^\uFEFF/, ''));

    let imported = 0, errors = [];
    for (const p of products) {
      let supplier_id = null;
      if (p.supplierName) {
        const sr = await window.api.suppliers.findOrCreate(p.supplierName);
        if (sr.ok) supplier_id = sr.data.id;
      }
      const res = await window.api.products.create({ ...p, supplier_id });
      if (res.ok) imported++;
      else errors.push(`${p.name}: ${res.error}`);
    }

    const resultEl = document.getElementById('import-csv-result');
    resultEl.className = errors.length ? 'alert alert-warning' : 'alert alert-success';
    resultEl.textContent = `${imported} produit(s) importé(s).` +
      (errors.length ? ` Erreurs : ${errors.slice(0,3).join(', ')}` : '');
    resultEl.style.display = 'flex';

    if (imported > 0) { Utils.toast(`${imported} produits importés`, 'success'); await loadProducts(); }
  } catch (e) {
    Utils.toast('Erreur CSV : ' + e.message, 'error');
  }

  btn.disabled = false; btn.textContent = 'Importer';
}

/**
 * Parse un CSV fournisseur en objets produit V3.
 * Format : Produit,Collection,Fournisseur,Coeff,Gamme,Prix_Gamme,Module,Prix_Module
 * Plusieurs lignes avec le même Produit → même produit, gammes/modules fusionnés.
 */
function parseCsvProducts(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const idx = h => headers.indexOf(h);

  const rows = lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    return {
      produit:    vals[idx('Produit')]    ?? '',
      collection: vals[idx('Collection')] ?? '',
      fournisseur:vals[idx('Fournisseur')] ?? '',
      coeff:      parseFloat(vals[idx('Coeff')]) || 2.0,
      gamme:      vals[idx('Gamme')]      ?? '',
      prixGamme:  parseFloat(vals[idx('Prix_Gamme')]) || 0,
      module:     vals[idx('Module')]     ?? '',
      prixModule: parseFloat(vals[idx('Prix_Module')]) || 0,
    };
  }).filter(r => r.produit && r.gamme && r.module);

  const byProduct = {};
  for (const row of rows) {
    if (!byProduct[row.produit]) {
      byProduct[row.produit] = {
        id:           Utils.slugify(row.produit),
        name:         row.produit,
        collection:   row.collection,
        supplierName: row.fournisseur,
        purchase_coefficient: row.coeff,
        price_rounding: 'none',
        description:  '',
        photo:        '',
        supplier_notes: '',
        ranges:  [],
        modules: {},   // moduleId → { id, name, prices: { rangeId: price } }
      };
    }
    const p = byProduct[row.produit];

    // Ajouter la gamme si nouvelle
    const rangeId = Utils.slugify(row.gamme) || `range_${p.ranges.length}`;
    if (!p.ranges.find(r => r.id === rangeId)) {
      p.ranges.push({ id: rangeId, name: row.gamme, base_price: row.prixGamme });
    }

    // Ajouter/enrichir le module
    const modId = Utils.slugify(row.module) || `mod_${Object.keys(p.modules).length}`;
    if (!p.modules[modId]) {
      p.modules[modId] = { id: modId, name: row.module, description: '', prices: {} };
    }
    p.modules[modId].prices[rangeId] = row.prixModule;
  }

  return Object.values(byProduct).map(p => ({
    ...p,
    modules: Object.values(p.modules),
    options: [],
  }));
}

function splitCsvLine(line) {
  const vals = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  vals.push(cur.trim());
  return vals;
}

// ==================== HELPERS VALIDATION UI ====================

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showFieldError(inputId, errId, msg) {
  document.getElementById(inputId)?.classList.add('error');
  showError(errId, msg);
}

function clearFieldError(inputId, errId) {
  document.getElementById(inputId)?.classList.remove('error');
  hideError(errId);
}

function hideAllErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
}
