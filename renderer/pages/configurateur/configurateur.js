/**
 * Configurateur — Composition de devis par sélection produits/modules/options
 * Génère un document (brouillon ou validé) via window.api.documents.*
 */

'use strict';

// ==================== ÉTAT ====================

let state = {
  products:        [],
  displayProducts: [],
  clients:         [],
  selectedClient:  null,
  devisLines:      [],
  totals:          { subtotal:0, discountAmt:0, total:0, depositAmt:0, balance:0 },
  confirmCb:       null,
  vatRate:         20,
  previewDocId:    null,    // id du brouillon d'aperçu en cours
  delivery:        { enabled: false, amount: 0, amountTTC: 0 },

  // Modal configuration produit
  cfg: {
    product:       null,    // produit en cours de configuration
    editingIdx:    null,    // index de la ligne en cours d'édition (null = ajout)
    rangeId:       null,    // gamme sélectionnée
    modules:       {},      // { module_id: { selected: bool, qty: number } }
    options:       {},      // { option_id: bool }
    colorRef:      '',      // référence coloris client
  },
};

// ==================== INITIALISATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupHeader();
  setupConfigModal();
  setupConfirm();
  const vatRes = await window.api.app.getConfig('vat_rate');
  state.vatRate = parseFloat(vatRes?.data ?? 20) || 20;
  await Promise.all([loadProducts(), loadClients()]);
});

function setupHeader() {
  document.getElementById('btn-preview')
    .addEventListener('click', handlePreview);
  document.getElementById('btn-clear-all')
    .addEventListener('click', confirmClearAll);
  document.getElementById('btn-save-draft')
    .addEventListener('click', () => handleSaveDevis(false));
  document.getElementById('btn-save-validate')
    .addEventListener('click', () => handleSaveDevis(true));

  document.getElementById('f-discount')
    .addEventListener('input', recalcDevisTotals);
  document.getElementById('f-deposit')
    .addEventListener('input', recalcDevisTotals);

  // Mode toggles %/€ pour remise et acompte
  document.getElementById('discount-mode-pct').addEventListener('click', () => {
    document.getElementById('discount-mode-pct').classList.add('active');
    document.getElementById('discount-mode-eur').classList.remove('active');
    const inp = document.getElementById('f-discount');
    inp.max = 100; inp.step = 0.1; inp.value = 0;
    recalcDevisTotals();
  });
  document.getElementById('discount-mode-eur').addEventListener('click', () => {
    document.getElementById('discount-mode-eur').classList.add('active');
    document.getElementById('discount-mode-pct').classList.remove('active');
    const inp = document.getElementById('f-discount');
    inp.removeAttribute('max'); inp.step = 1; inp.value = 0;
    recalcDevisTotals();
  });
  document.getElementById('deposit-mode-pct').addEventListener('click', () => {
    document.getElementById('deposit-mode-pct').classList.add('active');
    document.getElementById('deposit-mode-eur').classList.remove('active');
    const inp = document.getElementById('f-deposit');
    inp.max = 100; inp.step = 1; inp.value = 30;
    recalcDevisTotals();
  });
  document.getElementById('deposit-mode-eur').addEventListener('click', () => {
    document.getElementById('deposit-mode-eur').classList.add('active');
    document.getElementById('deposit-mode-pct').classList.remove('active');
    const inp = document.getElementById('f-deposit');
    inp.removeAttribute('max'); inp.step = 1; inp.value = 0;
    recalcDevisTotals();
  });

  // Livraison
  document.getElementById('f-delivery-enabled').addEventListener('change', e => {
    state.delivery.enabled = e.target.checked;
    const wrap = document.getElementById('delivery-amount-wrap');
    wrap.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) document.getElementById('f-delivery-amount').focus();
    renderDevisLines();
    recalcDevisTotals();
  });
  document.getElementById('f-delivery-amount').addEventListener('input', e => {
    const ttc = Math.max(0, parseFloat(e.target.value) || 0);
    state.delivery.amountTTC = ttc;
    state.delivery.amount    = round2(ttc / (1 + state.vatRate / 100));
    renderDevisLines();
    recalcDevisTotals();
  });

  // Recherche catalogue
  let timer;
  document.getElementById('catalog-search').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => applyFilter(), 150);
  });
  document.getElementById('catalog-supplier').addEventListener('change', applyFilter);

  // Client autocomplete
  document.getElementById('f-client').addEventListener('input', handleClientInput);

  // Nouveau client
  document.getElementById('btn-new-client').addEventListener('click', openNewClientModal);
  document.getElementById('btn-close-new-client').addEventListener('click', closeNewClientModal);
  document.getElementById('btn-cancel-new-client').addEventListener('click', closeNewClientModal);
  document.getElementById('btn-save-new-client').addEventListener('click', handleSaveNewClient);
  document.getElementById('modal-new-client').addEventListener('click', e => {
    if (e.target.id === 'modal-new-client') closeNewClientModal();
  });

  // Event delegation — catalog list
  document.getElementById('catalog-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action="add-product"]');
    if (btn) openConfigModal(btn.dataset.productId);
  });

  // Event delegation — devis lines list
  document.getElementById('devis-lines-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;
    if (action === 'edit-line')   openConfigModal(btn.dataset.productId, parseInt(btn.dataset.idx));
    if (action === 'remove-line') removeLine(parseInt(btn.dataset.idx));
  });
}

function setupConfigModal() {
  document.getElementById('btn-close-config')
    .addEventListener('click', closeConfigModal);
  document.getElementById('btn-cancel-config')
    .addEventListener('click', closeConfigModal);
  document.getElementById('btn-add-config')
    .addEventListener('click', handleAddConfig);
  document.getElementById('config-qty')
    .addEventListener('input', recalcConfigTotal);
  document.getElementById('modal-config').addEventListener('click', e => {
    if (e.target.id === 'modal-config') closeConfigModal();
  });

  // Event delegation — config ranges
  document.getElementById('config-ranges').addEventListener('change', e => {
    const radio = e.target.closest('input[data-range-id]');
    if (radio) handleRangeChange(radio.dataset.rangeId);
  });

  // Event delegation — config modules
  document.getElementById('config-modules').addEventListener('change', e => {
    const cb = e.target.closest('input[data-action="toggle-module"]');
    if (cb) { handleModuleToggle(cb.dataset.moduleId, cb.checked); return; }
    const qty = e.target.closest('input[data-action="module-qty"]');
    if (qty) handleModuleQty(qty.dataset.moduleId, qty.value);
  });

  // Event delegation — config options
  document.getElementById('config-options').addEventListener('change', e => {
    const cb = e.target.closest('input[data-action="toggle-option"]');
    if (cb) { handleOptionToggle(cb.dataset.optionId, cb.checked); return; }
    const qty = e.target.closest('input[data-action="option-qty"]');
    if (qty) handleOptionQty(qty.dataset.optionId, qty.value);
  });

  // Référence coloris
  document.getElementById('cfg-color-ref').addEventListener('input', e => {
    state.cfg.colorRef = e.target.value;
  });
}

function setupConfirm() {
  document.getElementById('btn-close-confirm')
    .addEventListener('click', closeConfirm);
  document.getElementById('btn-cancel-confirm')
    .addEventListener('click', closeConfirm);
  document.getElementById('btn-ok-confirm')
    .addEventListener('click', () => { state.confirmCb?.(); closeConfirm(); });
  document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target.id === 'modal-confirm') closeConfirm();
  });
}

// ==================== CHARGEMENT DONNÉES ====================

async function loadProducts() {
  const res = await window.api.products.getAll();
  if (!res.ok) { Utils.toast('Erreur chargement produits', 'error'); return; }

  // Seulement les produits actifs avec au moins une gamme
  state.products = res.data.filter(p => p.active && p.ranges?.length > 0);
  state.displayProducts = [...state.products];

  populateSupplierFilter();
  renderCatalog(state.displayProducts);
}

async function loadClients() {
  const res = await window.api.clients.getAll();
  if (!res.ok) return;
  state.clients = res.data;
  const dl = document.getElementById('clients-datalist');
  dl.innerHTML = '';
  res.data.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.company ? `${c.name} (${c.company})` : c.name;
    dl.appendChild(opt);
  });
}

// ==================== CATALOGUE ====================

function populateSupplierFilter() {
  const suppliers = [...new Set(state.products.map(p => p.supplier_name).filter(Boolean))].sort();
  const sel = document.getElementById('catalog-supplier');
  sel.innerHTML = '<option value="">Tous les fournisseurs</option>';
  suppliers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

function applyFilter() {
  const term     = document.getElementById('catalog-search').value.trim().toLowerCase();
  const supplier = document.getElementById('catalog-supplier').value;

  let list = state.products;
  if (term)     list = list.filter(p =>
    p.name.toLowerCase().includes(term) ||
    (p.collection || '').toLowerCase().includes(term) ||
    (p.supplier_name || '').toLowerCase().includes(term));
  if (supplier) list = list.filter(p => p.supplier_name === supplier);

  state.displayProducts = list;
  renderCatalog(list);
}

function renderCatalog(products) {
  const listEl  = document.getElementById('catalog-list');
  const emptyEl = document.getElementById('catalog-empty');

  if (products.length === 0) {
    listEl.innerHTML   = '';
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = products.map(p => {
    const coeff    = p.purchase_coefficient ?? 2.0;
    const minPrice = round2(Math.min(...p.ranges.map(r => r.base_price)) * coeff);
    return `
      <div class="product-card">
        <div class="product-card-row">
          <div style="min-width:0">
            <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
            <div class="product-card-meta">
              ${p.supplier_name ? Utils.escapeHtml(p.supplier_name) : ''}
              ${p.collection    ? ` · ${Utils.escapeHtml(p.collection)}` : ''}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" style="flex-shrink:0"
            data-action="add-product" data-product-id="${p.id}">+ Ajouter</button>
        </div>
        <div class="product-card-tags" style="margin-top:6px">
          <span class="badge badge-gray">${p.ranges.length} gamme${p.ranges.length > 1 ? 's' : ''}</span>
          <span class="badge badge-gray">${p.modules.length} module${p.modules.length !== 1 ? 's' : ''}</span>
          ${p.options.length ? `<span class="badge badge-gray">${p.options.length} option${p.options.length !== 1 ? 's' : ''}</span>` : ''}
          <span class="product-card-price">dès ${Utils.formatPrice(minPrice)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== CLIENT ====================

function handleClientInput() {
  const val = document.getElementById('f-client').value.trim();
  if (!val) { state.selectedClient = null; return; }
  const match = state.clients.find(c =>
    c.name === val || `${c.name} (${c.company})` === val);
  if (match) {
    state.selectedClient = {
      id: match.id, name: match.name, email: match.email,
      phone: match.phone, company: match.company,
      address: match.address, city: match.city, zip: match.zip,
    };
  } else {
    state.selectedClient = { name: val };
  }
}

// ==================== NOUVEAU CLIENT ====================

function openNewClientModal() {
  ['nc-name','nc-company','nc-email','nc-phone','nc-address','nc-zip','nc-city']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('modal-new-client').classList.add('show');
  document.getElementById('nc-name').focus();
}

function closeNewClientModal() {
  document.getElementById('modal-new-client').classList.remove('show');
}

async function handleSaveNewClient() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) { Utils.toast('Le nom est obligatoire', 'error'); return; }

  const data = {
    name,
    company:  document.getElementById('nc-company').value.trim(),
    email:    document.getElementById('nc-email').value.trim(),
    phone:    document.getElementById('nc-phone').value.trim(),
    address:  document.getElementById('nc-address').value.trim(),
    zip:      document.getElementById('nc-zip').value.trim(),
    city:     document.getElementById('nc-city').value.trim(),
  };

  const res = await window.api.clients.create(data);
  if (!res.ok) { Utils.toast('Erreur : ' + res.error, 'error'); return; }

  // Recharger la liste clients et sélectionner le nouveau
  await loadClients();
  const newClient = state.clients.find(c => c.id === res.data.id) ||
                    state.clients.find(c => c.name === name);
  if (newClient) {
    state.selectedClient = {
      id: newClient.id, name: newClient.name, email: newClient.email,
      phone: newClient.phone, company: newClient.company,
      address: newClient.address, city: newClient.city, zip: newClient.zip,
    };
    const label = newClient.company ? `${newClient.name} (${newClient.company})` : newClient.name;
    document.getElementById('f-client').value = label;
  }

  Utils.toast(`Client "${name}" créé`, 'success');
  closeNewClientModal();
}

// ==================== MODAL CONFIGURATION ====================

function openConfigModal(productId, editingIdx = null) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  state.cfg.product    = product;
  state.cfg.editingIdx = editingIdx;

  // Si édition d'une ligne existante : pré-remplir depuis product_config
  const existing = editingIdx !== null ? state.devisLines[editingIdx] : null;
  const existingCfg = existing?.product_config ?? null;

  // Initialise état config
  state.cfg.rangeId = existingCfg?.range_id ?? product.ranges[0]?.id ?? null;
  state.cfg.modules = {};
  product.modules.forEach(m => {
    const prev = existingCfg?.modules?.find(em => em.id === m.id);
    state.cfg.modules[m.id] = { selected: !!prev, qty: prev?.qty ?? 1 };
  });
  state.cfg.options = {};
  product.options.forEach(o => {
    state.cfg.options[o.id] = existingCfg?.options?.find(eo => eo.id === o.id)?.qty ?? 0;
  });

  document.getElementById('config-product-name').textContent = product.name;
  document.getElementById('config-product-meta').textContent =
    [product.supplier_name, product.collection].filter(Boolean).join(' · ');

  state.cfg.colorRef = existing?.color_ref ?? '';
  document.getElementById('cfg-color-ref').value = state.cfg.colorRef;
  document.getElementById('config-qty').value = existing?.qty ?? 1;
  document.getElementById('btn-add-config').textContent =
    editingIdx !== null ? 'Mettre à jour' : 'Ajouter au devis';

  renderConfigRanges();
  renderConfigModules();
  renderConfigOptions();
  recalcConfigTotal();

  document.getElementById('modal-config').classList.add('show');
}

function closeConfigModal() {
  document.getElementById('modal-config').classList.remove('show');
  state.cfg.product    = null;
  state.cfg.editingIdx = null;
}

// ==================== GAMMES ====================

function renderConfigRanges() {
  const container = document.getElementById('config-ranges');
  const ranges    = state.cfg.product.ranges;

  const coeff = state.cfg.product.purchase_coefficient ?? 2.0;
  container.innerHTML = ranges.map(r => {
    const sellPrice = round2(r.base_price * coeff);
    return `
    <label class="range-option ${r.id === state.cfg.rangeId ? 'selected' : ''}">
      <input type="radio" name="cfg-range" value="${r.id}"
        ${r.id === state.cfg.rangeId ? 'checked' : ''}
        data-range-id="${r.id}">
      <span class="range-option-name">${Utils.escapeHtml(r.name)}</span>
      <div style="text-align:right">
        <span class="range-option-price">${Utils.formatPrice(sellPrice)}</span>
      </div>
    </label>
    `;
  }).join('');
}

function handleRangeChange(rangeId) {
  state.cfg.rangeId = rangeId;
  // Mettre à jour l'apparence des labels
  document.querySelectorAll('.range-option').forEach(el => {
    el.classList.toggle('selected', el.querySelector('input').dataset.rangeId === rangeId);
  });
  // Mettre à jour les prix des modules affichés
  renderConfigModules();
  recalcConfigTotal();
}

// ==================== MODULES ====================

function renderConfigModules() {
  const container = document.getElementById('config-modules');
  const modules   = state.cfg.product.modules;

  if (modules.length === 0) {
    container.innerHTML = '<div class="text-sm text-muted">Aucun module pour ce produit.</div>';
    return;
  }

  const coeff = state.cfg.product.purchase_coefficient ?? 2.0;
  container.innerHTML = modules.map(m => {
    const ms        = state.cfg.modules[m.id];
    const paPrice   = m.prices?.[state.cfg.rangeId] ?? 0;
    const sellPrice = round2(paPrice * coeff);
    return `
      <div class="module-row ${ms.selected ? 'selected' : ''}" id="mrow-${m.id}">
        <input type="checkbox" ${ms.selected ? 'checked' : ''}
          data-module-id="${m.id}" data-action="toggle-module">
        <span class="module-row-name">${Utils.escapeHtml(m.name)}</span>
        <div class="module-row-price" style="text-align:right">
          <div>${Utils.formatPrice(sellPrice)}</div>
        </div>
        <input type="number" class="form-control module-qty" value="${ms.qty}"
          min="1" step="1" style="${ms.selected ? '' : 'visibility:hidden'}"
          data-module-id="${m.id}" data-action="module-qty">
      </div>
    `;
  }).join('');
}

function handleModuleToggle(moduleId, checked) {
  state.cfg.modules[moduleId].selected = checked;
  const row = document.getElementById(`mrow-${moduleId}`);
  if (row) {
    row.classList.toggle('selected', checked);
    const qtyInput = row.querySelector('.module-qty');
    if (qtyInput) qtyInput.style.visibility = checked ? 'visible' : 'hidden';
  }
  recalcConfigTotal();
}

function handleModuleQty(moduleId, val) {
  const qty = Math.max(1, parseInt(val) || 1);
  state.cfg.modules[moduleId].qty = qty;
  recalcConfigTotal();
}

// ==================== OPTIONS ====================

function renderConfigOptions() {
  const container = document.getElementById('config-options');
  const options   = state.cfg.product.options;
  const section   = document.getElementById('section-options');

  if (options.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  // Mettre à jour le badge de comptage
  const badge = document.getElementById('options-count-badge');
  if (badge) {
    const selCount = options.filter(o => (state.cfg.options[o.id] || 0) > 0).length;
    badge.textContent = selCount > 0 ? `${selCount}/${options.length} sélectionnée${selCount > 1 ? 's' : ''}` : `${options.length} disponible${options.length > 1 ? 's' : ''}`;
    badge.style.background = selCount > 0 ? '#dcfce7' : '';
    badge.style.color = selCount > 0 ? '#16a34a' : '';
  }

  const coeff = state.cfg.product.purchase_coefficient ?? 2.0;
  container.innerHTML = options.map(o => {
    const qty     = state.cfg.options[o.id] || 0;
    const sel     = qty > 0;
    const pvPrice = round2(o.price * coeff);
    return `
      <div class="option-row ${sel ? 'selected' : ''}" id="orow-${o.id}">
        <input type="checkbox" ${sel ? 'checked' : ''}
          data-option-id="${o.id}" data-action="toggle-option">
        <span class="option-row-name">${Utils.escapeHtml(o.name)}</span>
        <span class="option-row-price">+${Utils.formatPrice(pvPrice)}</span>
        <input type="number" class="module-qty" value="${qty || 1}"
          min="1" step="1" style="${sel ? '' : 'visibility:hidden'}"
          data-option-id="${o.id}" data-action="option-qty">
      </div>
    `;
  }).join('');
}

function handleOptionToggle(optionId, checked) {
  state.cfg.options[optionId] = checked ? 1 : 0;
  const row = document.getElementById(`orow-${optionId}`);
  if (row) {
    row.classList.toggle('selected', checked);
    const qtyInput = row.querySelector('.module-qty');
    if (qtyInput) qtyInput.style.visibility = checked ? 'visible' : 'hidden';
  }
  updateOptionsBadge();
  recalcConfigTotal();
}

function updateOptionsBadge() {
  const options = state.cfg.product?.options ?? [];
  const badge = document.getElementById('options-count-badge');
  if (!badge || !options.length) return;
  const selCount = options.filter(o => (state.cfg.options[o.id] || 0) > 0).length;
  badge.textContent = selCount > 0 ? `${selCount}/${options.length} sélectionnée${selCount > 1 ? 's' : ''}` : `${options.length} disponible${options.length > 1 ? 's' : ''}`;
  badge.style.background = selCount > 0 ? '#dcfce7' : '';
  badge.style.color = selCount > 0 ? '#16a34a' : '';
}

function handleOptionQty(optionId, val) {
  const qty = Math.max(1, parseInt(val) || 1);
  state.cfg.options[optionId] = qty;
  recalcConfigTotal();
}

// ==================== RECALCUL CONFIG ====================

function recalcConfigTotal() {
  if (!state.cfg.product) return;

  const range = state.cfg.product.ranges.find(r => r.id === state.cfg.rangeId);
  const base  = range?.base_price ?? 0;

  let modulesTotal = 0;
  state.cfg.product.modules.forEach(m => {
    const ms = state.cfg.modules[m.id];
    if (ms.selected) {
      const price = m.prices?.[state.cfg.rangeId] ?? 0;
      modulesTotal += price * ms.qty;
    }
  });

  let optionsTotal = 0;
  state.cfg.product.options.forEach(o => {
    const qty = state.cfg.options[o.id] || 0;
    if (qty > 0) optionsTotal += o.price * qty;
  });

  const coeff  = state.cfg.product.purchase_coefficient ?? 2.0;
  const mode   = state.cfg.product.price_rounding ?? 'none';
  // PA × coeff = TTC (arrondi selon le mode choisi)
  const pvTTC  = applyRounding(round2((base + modulesTotal + optionsTotal) * coeff), mode);
  const pvHT   = round2(pvTTC / (1 + state.vatRate / 100));
  const vatAmt = round2(pvTTC - pvHT);
  const qty    = Math.max(1, parseInt(document.getElementById('config-qty').value) || 1);
  const lineHT  = round2(pvHT * qty);
  const lineTTC = round2(pvTTC * qty);

  document.getElementById('ct-base').textContent       = Utils.formatPrice(round2(base * coeff));
  document.getElementById('ct-modules').textContent    = Utils.formatPrice(round2(modulesTotal * coeff));
  document.getElementById('ct-options').textContent    = Utils.formatPrice(round2(optionsTotal * coeff));
  document.getElementById('ct-unit-total').textContent = Utils.formatPrice(pvHT);
  document.getElementById('ct-vat-label').textContent  = `TVA ${state.vatRate}%`;
  document.getElementById('ct-vat').textContent        = Utils.formatPrice(vatAmt);
  document.getElementById('ct-ttc').textContent        = Utils.formatPrice(pvTTC);
  document.getElementById('ct-qty-total').textContent  =
    qty > 1 ? `× ${qty} = ${Utils.formatPrice(lineHT)} HT / ${Utils.formatPrice(lineTTC)} TTC` : '';
}

// ==================== AJOUTER AU DEVIS ====================

function handleAddConfig() {
  const product = state.cfg.product;
  if (!product || !state.cfg.rangeId) return;

  const range  = product.ranges.find(r => r.id === state.cfg.rangeId);
  const base   = range?.base_price ?? 0;
  const coeff  = product.purchase_coefficient ?? 2.0;
  const mode   = product.price_rounding ?? 'none';
  const qty    = Math.max(1, parseInt(document.getElementById('config-qty').value) || 1);

  // Modules sélectionnés (prix = PA × coeff, avant arrondi global)
  const selectedModules = product.modules
    .filter(m => state.cfg.modules[m.id]?.selected)
    .map(m => {
      const paPrice   = m.prices?.[state.cfg.rangeId] ?? 0;
      const sellPrice = round2(paPrice * coeff);
      const mQty      = state.cfg.modules[m.id].qty;
      return { id: m.id, name: m.name, description: m.description || '', dimensions: m.dimensions || '', qty: mQty, unit_price: sellPrice, total: round2(sellPrice * mQty) };
    });

  // Options sélectionnées (prix = PA × coeff, qty supportée)
  const selectedOptions = product.options
    .filter(o => (state.cfg.options[o.id] || 0) > 0)
    .map(o => {
      const oQty  = state.cfg.options[o.id];
      const pvPrc = round2(o.price * coeff);
      return { id: o.id, name: o.name, description: o.description || '', qty: oQty, price: pvPrc, total: round2(pvPrc * oQty) };
    });

  const modulesTotal   = selectedModules.reduce((s, m) => s + m.total, 0);
  const optionsTotal   = selectedOptions.reduce((s, o) => s + o.total, 0);
  // PA × coeff = TTC (arrondi), puis HT = TTC / (1 + TVA%)
  const unitPriceTTC   = applyRounding(round2(base * coeff) + modulesTotal + optionsTotal, mode);
  const unitPrice      = round2(unitPriceTTC / (1 + state.vatRate / 100));
  const lineTotal      = round2(unitPrice * qty);

  // Description textuelle
  const descParts = [
    ...selectedModules.map(m => `${m.qty > 1 ? m.qty + '× ' : ''}${m.name}`),
    ...selectedOptions.map(o => `${o.qty > 1 ? o.qty + '× ' : ''}${o.name}`),
  ];

  const colorRef = document.getElementById('cfg-color-ref').value.trim();

  const line = {
    id: state.cfg.editingIdx !== null
      ? state.devisLines[state.cfg.editingIdx].id
      : `line_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    designation:      `${product.name} — ${range.name}`,
    description:      descParts.join(' · '),
    color_ref:        colorRef,
    qty,
    unit_price:       unitPrice,
    discount_percent: 0,
    total:            lineTotal,
    product_config: {
      product_id:          product.id,
      range_id:            state.cfg.rangeId,
      supplier_name:       product.supplier_name || '',
      product_description: product.description  || '',
      modules:             selectedModules,
      options:             selectedOptions,
    },
  };

  if (state.cfg.editingIdx !== null) {
    state.devisLines[state.cfg.editingIdx] = line;
  } else {
    state.devisLines.push(line);
  }

  closeConfigModal();
  renderDevisLines();
  recalcDevisTotals();
}

// ==================== RENDU DEVIS ====================

function renderDevisLines() {
  const listEl  = document.getElementById('devis-lines-list');
  const emptyEl = document.getElementById('devis-empty');
  const count   = document.getElementById('devis-count');

  const n = state.devisLines.length;
  count.textContent = `${n} ligne${n !== 1 ? 's' : ''}`;

  if (n === 0) {
    emptyEl.style.display = 'flex';
    listEl.innerHTML      = '';
    return;
  }
  emptyEl.style.display = 'none';

  const productRows = state.devisLines.map((line, idx) => {
    const opts = line.product_config?.options ?? [];
    const optBadges = opts.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">
          ${opts.map(o => `
            <span style="display:inline-flex;align-items:center;gap:3px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:1px 7px;font-size:11px;color:#16a34a;white-space:nowrap">
              ＋ ${Utils.escapeHtml(o.name)}${o.qty > 1 ? ` ×${o.qty}` : ''}
            </span>`).join('')}
        </div>`
      : '';
    return `
    <div class="devis-line">
      <div class="devis-line-body">
        <div class="devis-line-name">${Utils.escapeHtml(line.designation)}</div>
        ${line.description
          ? `<div class="devis-line-desc">${Utils.escapeHtml(line.description)}</div>`
          : ''}
        ${line.color_ref
          ? `<div class="devis-line-desc" style="color:var(--color-primary)">🎨 ${Utils.escapeHtml(line.color_ref)}</div>`
          : ''}
        ${optBadges}
      </div>
      <div class="devis-line-right">
        <div class="devis-line-price">${Utils.formatPrice(line.total)}</div>
        ${line.qty > 1
          ? `<div class="devis-line-qty">${line.qty} × ${Utils.formatPrice(line.unit_price)}</div>`
          : ''}
        <div class="flex gap-1" style="margin-top:4px">
          ${line.product_config
            ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px"
                data-action="edit-line" data-product-id="${line.product_config.product_id}" data-idx="${idx}">✏️ Modifier</button>`
            : ''}
          <button class="btn btn-ghost btn-sm btn-icon" title="Supprimer"
            style="color:var(--color-danger)"
            data-action="remove-line" data-idx="${idx}">✕</button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  const deliveryRow = (state.delivery.enabled && state.delivery.amount > 0) ? `
    <div class="devis-line" style="border-color:var(--color-gray-300);background:var(--color-gray-50)">
      <div class="devis-line-body">
        <div class="devis-line-name">🚚 Livraison</div>
      </div>
      <div class="devis-line-right">
        <div class="devis-line-price">${Utils.formatPrice(state.delivery.amountTTC ?? state.delivery.amount)} TTC</div>
      </div>
    </div>
  ` : '';

  listEl.innerHTML = productRows + deliveryRow;
}

function removeLine(idx) {
  state.devisLines.splice(idx, 1);
  renderDevisLines();
  recalcDevisTotals();
}

// ==================== TOTAUX DEVIS ====================

function recalcDevisTotals() {
  const deliveryAmt   = state.delivery.enabled ? state.delivery.amount : 0;
  const subtotal      = state.devisLines.reduce((s, l) => s + l.total, 0) + deliveryAmt;
  const vatAmt        = round2(subtotal * state.vatRate / 100);
  const totalTTC_brut = round2(subtotal + vatAmt);

  // Remise appliquée sur le TTC brut
  const discInput   = parseFloat(document.getElementById('f-discount').value) || 0;
  const discInEur   = document.getElementById('discount-mode-eur').classList.contains('active');
  const discAmt     = discInEur
    ? round2(Math.min(Math.max(discInput, 0), totalTTC_brut))
    : round2(totalTTC_brut * clamp(discInput, 0, 100) / 100);
  const discPct     = totalTTC_brut > 0 ? round2(discAmt / totalTTC_brut * 100) : 0;
  const netTTC      = round2(totalTTC_brut - discAmt);

  // Acompte calculé sur le net TTC (après remise)
  const depInput    = parseFloat(document.getElementById('f-deposit').value) || 0;
  const depInEur    = document.getElementById('deposit-mode-eur').classList.contains('active');
  const depositAmt  = depInEur
    ? round2(Math.min(Math.max(depInput, 0), netTTC))
    : round2(netTTC * clamp(depInput, 0, 100) / 100);
  const depositPct  = netTTC > 0 ? round2(depositAmt / netTTC * 100) : 0;
  const balance     = round2(netTTC - depositAmt);

  state.totals = { subtotal, discountPct: discPct, discountAmt: discAmt,
                   total: netTTC, vatAmt, totalTTC: totalTTC_brut, depositPct, depositAmt, balance };

  document.getElementById('dt-subtotal').textContent  = Utils.formatPrice(subtotal);
  document.getElementById('dt-vat-label').textContent = `TVA ${state.vatRate}%`;
  document.getElementById('dt-vat').textContent       = Utils.formatPrice(vatAmt);
  document.getElementById('dt-ttc').textContent       = Utils.formatPrice(totalTTC_brut);
  document.getElementById('dt-discount').textContent  = `— ${Utils.formatPrice(discAmt)}`;
  document.getElementById('dt-total').textContent     = Utils.formatPrice(netTTC);
  document.getElementById('dt-deposit').textContent   = Utils.formatPrice(depositAmt) + ' TTC';
  document.getElementById('dt-balance').textContent   = Utils.formatPrice(balance) + ' TTC';
}

// ==================== SAUVEGARDE ====================

function buildDocData() {
  const t     = state.totals;
  const type  = document.getElementById('f-doc-type').value;
  const lines = [...state.devisLines];
  if (state.delivery.enabled && state.delivery.amount > 0) {
    lines.push({
      id:               'delivery',
      designation:      'Livraison',
      description:      '',
      color_ref:        '',
      qty:              1,
      unit_price:       state.delivery.amount,
      discount_percent: 0,
      total:            state.delivery.amount,
      is_delivery:      true,
      product_config:   null,
    });
  }
  return {
    type,
    client_id:        state.selectedClient?.id ?? null,
    client_snapshot:  state.selectedClient      ?? {},
    product_snapshot: { lines },
    subtotal:         t.subtotal,
    discount_percent: t.discountPct,
    discount_amount:  t.discountAmt,
    total:            t.total,
    deposit_percent:  t.depositPct,
    deposit_amount:   t.depositAmt,
    balance:          t.balance,
    notes:            document.getElementById('f-notes').value.trim(),
  };
}

async function handlePreview() {
  if (state.devisLines.length === 0) {
    Utils.toast('Ajoutez au moins un produit pour prévisualiser', 'warning');
    return;
  }

  const btn = document.getElementById('btn-preview');
  btn.disabled = true;

  try {
    const docData = buildDocData();
    let docId = state.previewDocId;

    if (docId) {
      const upd = await window.api.documents.update(docId, docData);
      if (!upd.ok) docId = null; // si le brouillon a été supprimé, en recréer un
    }

    if (!docId) {
      const res = await window.api.documents.create(docData);
      if (!res.ok) { Utils.toast('Erreur aperçu : ' + res.error, 'error'); return; }
      docId = res.data.id;
      state.previewDocId = docId;
    }

    await window.api.documents.print(docId);
  } finally {
    btn.disabled = false;
  }
}

async function handleSaveDevis(validate) {
  if (state.devisLines.length === 0) {
    Utils.toast('Ajoutez au moins un produit au devis', 'warning');
    return;
  }

  const saveBtn     = document.getElementById('btn-save-draft');
  const validateBtn = document.getElementById('btn-save-validate');
  saveBtn.disabled = validateBtn.disabled = true;

  const createRes = await window.api.documents.create(buildDocData());
  if (!createRes.ok) {
    Utils.toast(createRes.error, 'error');
    saveBtn.disabled = validateBtn.disabled = false;
    return;
  }

  if (validate) {
    const valRes = await window.api.documents.validate(createRes.data.id);
    if (!valRes.ok) {
      Utils.toast('Brouillon créé mais validation échouée : ' + valRes.error, 'warning');
    } else {
      Utils.toast(`Document validé : ${valRes.data.number}`, 'success');
    }
  } else {
    Utils.toast('Brouillon créé avec succès', 'success');
  }

  setTimeout(() => { window.location.href = '../documents/index.html'; }, 800);
}

// ==================== EFFACER ====================

function confirmClearAll() {
  if (state.devisLines.length === 0) return;
  openConfirm(
    'Tout effacer',
    'Supprimer toutes les lignes du devis en cours ?',
    () => {
      state.devisLines   = [];
      state.previewDocId = null;
      state.delivery     = { enabled: false, amount: 0, amountTTC: 0 };
      document.getElementById('f-delivery-enabled').checked = false;
      document.getElementById('delivery-amount-wrap').style.display = 'none';
      document.getElementById('f-delivery-amount').value = '';
      document.getElementById('f-notes').value = '';
      renderDevisLines();
      recalcDevisTotals();
    }
  );
}

// ==================== CONFIRM ====================

function openConfirm(title, message, cb) {
  state.confirmCb = cb;
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('modal-confirm').classList.add('show');
}

function closeConfirm() {
  document.getElementById('modal-confirm').classList.remove('show');
  state.confirmCb = null;
}

// ==================== HELPERS ====================

function round2(n)        { return Math.round(n * 100) / 100; }
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function applyRounding(price, mode) {
  if (mode === 'integer') return Math.round(price);
  if (mode === 'ten')     return Math.round(price / 10) * 10;
  return round2(price);
}
