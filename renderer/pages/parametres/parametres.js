/**
 * Paramètres — Configuration entreprise, valeurs par défaut, sauvegardes
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupLogoUpload();
  await loadView('company');
});

// ==================== NAVIGATION ====================

function setupNav() {
  document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
    item.addEventListener('click', () => loadView(item.dataset.view));
  });
}

async function loadView(view) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

  const el  = document.getElementById(`view-${view}`);
  const nav = document.querySelector(`[data-view="${view}"]`);
  if (el)  el.style.display  = 'block';
  if (nav) nav.classList.add('active');

  const titles = { company: 'Mon entreprise', defaults: 'Valeurs par défaut', backup: 'Sauvegardes' };
  document.getElementById('page-title').textContent = titles[view] ?? 'Paramètres';

  if (view === 'company')  await loadCompanySettings();
  if (view === 'defaults') await loadDefaultSettings();
  if (view === 'backup')   await loadBackups();
}

// ==================== MON ENTREPRISE ====================

const COMPANY_KEYS = ['company_name','company_trade_name','company_address','company_city','company_zip',
                      'company_phone','company_email','company_siret','company_ape','company_capital',
                      'company_vat','vat_rate'];

const COMPANY_FIELDS = {
  company_name:       'c-name',
  company_trade_name: 'c-trade-name',
  company_address:    'c-address',
  company_city:       'c-city',
  company_zip:        'c-zip',
  company_phone:      'c-phone',
  company_email:      'c-email',
  company_siret:      'c-siret',
  company_ape:        'c-ape',
  company_capital:    'c-capital',
  company_vat:        'c-vat',
  vat_rate:           'c-vat-rate',
};

async function loadCompanySettings() {
  for (const [key, fieldId] of Object.entries(COMPANY_FIELDS)) {
    const res = await window.api.app.getConfig(key);
    if (res.ok && res.data !== null) {
      document.getElementById(fieldId).value = res.data;
    }
  }

  document.getElementById('btn-save-company').onclick = saveCompanySettings;

  await loadLogoPreview();
}

async function saveCompanySettings() {
  const btn = document.getElementById('btn-save-company');
  btn.disabled = true;

  for (const [key, fieldId] of Object.entries(COMPANY_FIELDS)) {
    const value = document.getElementById(fieldId).value.trim();
    await window.api.app.setConfig(key, value);
  }

  btn.disabled = false;
  Utils.toast('Paramètres enregistrés', 'success');
}

// ==================== VALEURS PAR DÉFAUT ====================

async function loadDefaultSettings() {
  const [discRes, depRes, alertRes] = await Promise.all([
    window.api.app.getConfig('default_discount'),
    window.api.app.getConfig('default_deposit'),
    window.api.app.getConfig('alert_days'),
  ]);
  if (discRes.ok  && discRes.data  !== null) document.getElementById('d-discount').value   = discRes.data;
  if (depRes.ok   && depRes.data   !== null) document.getElementById('d-deposit').value    = depRes.data;
  if (alertRes.ok && alertRes.data !== null) document.getElementById('d-alert-days').value = alertRes.data;

  document.getElementById('btn-save-defaults').onclick = saveDefaultSettings;
}

async function saveDefaultSettings() {
  const btn = document.getElementById('btn-save-defaults');
  btn.disabled = true;

  await Promise.all([
    window.api.app.setConfig('default_discount', document.getElementById('d-discount').value),
    window.api.app.setConfig('default_deposit',  document.getElementById('d-deposit').value),
    window.api.app.setConfig('alert_days',        document.getElementById('d-alert-days').value),
  ]);

  btn.disabled = false;
  Utils.toast('Valeurs par défaut enregistrées', 'success');
}

// ==================== SAUVEGARDES ====================

async function loadBackups() {
  document.getElementById('btn-backup-now').onclick = handleBackupNow;
  document.getElementById('btn-refresh-backups').onclick = refreshBackups;
  document.getElementById('btn-export-db').onclick = handleExportDb;
  document.getElementById('btn-import-db').onclick = handleImportDb;
  document.getElementById('btn-save-auto-backup').onclick = saveAutoBackupSettings;
  document.getElementById('auto-backup-enabled').addEventListener('change', e => {
    document.getElementById('auto-backup-settings').style.opacity = e.target.checked ? '1' : '0.4';
    document.getElementById('auto-backup-settings').style.pointerEvents = e.target.checked ? '' : 'none';
  });
  setupRestoreModal();
  await loadAutoBackupSettings();
  await refreshBackups();
}

async function loadAutoBackupSettings() {
  const res = await window.api.app.getAutoBackupStatus();
  if (!res.ok) return;
  const s = res.data;

  document.getElementById('auto-backup-enabled').checked = s.enabled;
  document.getElementById('auto-backup-time').value      = s.time || '20:00';
  const sel = document.getElementById('auto-backup-retention');
  sel.value = String(s.retentionDays);
  if (!sel.value) sel.value = '30';

  document.getElementById('auto-backup-settings').style.opacity       = s.enabled ? '1' : '0.4';
  document.getElementById('auto-backup-settings').style.pointerEvents = s.enabled ? '' : 'none';

  const badge = document.getElementById('auto-backup-status-badge');
  if (s.enabled) {
    badge.textContent = `Activée · ${s.time}`;
    badge.className   = 'badge badge-success';
  } else {
    badge.textContent = 'Désactivée';
    badge.className   = 'badge badge-gray';
  }

  const lastEl = document.getElementById('auto-backup-last');
  if (s.lastBackupTime) {
    const d = new Date(s.lastBackupTime);
    lastEl.textContent = `Dernière sauvegarde automatique : ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}`;
  } else {
    lastEl.textContent = 'Aucune sauvegarde automatique effectuée.';
  }
}

async function saveAutoBackupSettings() {
  const enabled   = document.getElementById('auto-backup-enabled').checked;
  const time      = document.getElementById('auto-backup-time').value || '20:00';
  const retention = document.getElementById('auto-backup-retention').value || '30';

  await Promise.all([
    window.api.app.setConfig('auto_backup_enabled',        String(enabled)),
    window.api.app.setConfig('auto_backup_time',           time),
    window.api.app.setConfig('auto_backup_retention_days', retention),
  ]);

  Utils.toast('Paramètres de sauvegarde automatique enregistrés', 'success');
  await loadAutoBackupSettings();
}

function setupRestoreModal() {
  const modal = document.getElementById('modal-restore');
  document.getElementById('btn-restore-cancel').onclick  = closeRestoreModal;
  document.getElementById('btn-restore-cancel2').onclick = closeRestoreModal;
  modal.addEventListener('click', e => { if (e.target === modal) closeRestoreModal(); });
}

function openRestoreModal(fileName) {
  document.getElementById('restore-file-name').textContent = fileName;
  document.getElementById('btn-restore-confirm').onclick = () => handleRestore(fileName);
  document.getElementById('modal-restore').classList.add('show');
}

function closeRestoreModal() {
  document.getElementById('modal-restore').classList.remove('show');
}

async function handleRestore(fileName) {
  const btn = document.getElementById('btn-restore-confirm');
  btn.disabled    = true;
  btn.textContent = '⏳ Restauration…';
  const res = await window.api.app.restore(fileName);
  if (!res.ok) {
    btn.disabled    = false;
    btn.textContent = '♻️ Restaurer et redémarrer';
    Utils.toast('Erreur restauration : ' + res.error, 'error');
    closeRestoreModal();
  }
  // Si ok, l'app redémarre — pas besoin de gérer la suite
}

async function refreshBackups() {
  const res = await window.api.app.getBackups();
  if (!res.ok) { Utils.toast('Erreur chargement sauvegardes', 'error'); return; }
  renderBackups(res.data);
}

function renderBackups(backups) {
  const tbody   = document.getElementById('backups-tbody');
  const empty   = document.getElementById('backups-empty');
  const wrapper = document.getElementById('backups-table-wrapper');

  if (backups.length === 0) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';
  tbody.innerHTML = backups.map((b, idx) => `
    <tr ${idx === 0 ? 'style="background:var(--color-success-light)"' : ''}>
      <td style="font-size:13px;font-family:monospace">
        ${Utils.escapeHtml(b.name)}
        ${idx === 0 ? '<span class="badge badge-success" style="margin-left:6px;font-size:10px">Dernière</span>' : ''}
      </td>
      <td style="font-size:13px">${Utils.formatDateTime(b.date)}</td>
      <td style="text-align:right;font-size:13px">${formatSize(b.size)}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="openRestoreModal('${Utils.escapeHtml(b.name)}')">
          ♻️ Restaurer
        </button>
      </td>
    </tr>
  `).join('');
}

async function handleExportDb() {
  const btn = document.getElementById('btn-export-db');
  btn.disabled = true;
  btn.textContent = 'Export en cours...';
  try {
    const res = await window.api.app.exportDb();
    if (res.ok && res.data.exported) {
      Utils.toast('Données exportées avec succès', 'success');
    } else if (res.ok) {
      // annulé par l'utilisateur
    } else {
      Utils.toast('Erreur export : ' + res.error, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Exporter les données';
  }
}

async function handleImportDb() {
  const btn = document.getElementById('btn-import-db');
  const confirmed = window.confirm(
    'Cette action remplace TOUTES vos données actuelles et redémarre l\'application.\nUne sauvegarde automatique sera créée avant l\'import.\n\nContinuer ?'
  );
  if (!confirmed) return;

  btn.disabled = true;
  btn.textContent = 'Import en cours...';
  await window.api.app.importDb();
  // L'app redémarre — pas besoin de gérer la suite
}

async function handleBackupNow() {
  const btn    = document.getElementById('btn-backup-now');
  const status = document.getElementById('backup-status');
  btn.disabled    = true;
  btn.textContent = 'Sauvegarde en cours...';

  const res = await window.api.app.backup();

  btn.disabled    = false;
  btn.textContent = '💾 Sauvegarder maintenant';

  if (!res.ok) { Utils.toast('Erreur sauvegarde : ' + res.error, 'error'); return; }

  status.textContent    = `✓ Sauvegarde créée`;
  status.style.display  = 'inline';
  setTimeout(() => { status.style.display = 'none'; }, 4000);

  Utils.toast('Sauvegarde créée avec succès', 'success');
  await refreshBackups();
}

// ==================== LOGO ====================

async function loadLogoPreview() {
  const res = await window.api.app.getConfig('company_logo');
  if (res.ok && res.data) {
    showLogoPreview(res.data);
  } else {
    hideLogoPreview();
  }
}

function showLogoPreview(dataUrl) {
  document.getElementById('logo-preview').src             = dataUrl;
  document.getElementById('logo-preview-wrapper').style.display = 'block';
  document.getElementById('logo-empty').style.display           = 'none';
}

function hideLogoPreview() {
  document.getElementById('logo-preview-wrapper').style.display = 'none';
  document.getElementById('logo-empty').style.display           = 'block';
}

function setupLogoUpload() {
  const input = document.getElementById('logo-file-input');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      Utils.toast('Fichier trop volumineux (max 2 Mo)', 'error');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      await window.api.app.setConfig('company_logo', dataUrl);
      showLogoPreview(dataUrl);
      Utils.toast('Logo enregistré', 'success');
      input.value = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-delete-logo').addEventListener('click', async () => {
    await window.api.app.setConfig('company_logo', '');
    hideLogoPreview();
    Utils.toast('Logo supprimé', 'success');
  });
}

function formatSize(bytes) {
  if (bytes < 1024)       return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}
