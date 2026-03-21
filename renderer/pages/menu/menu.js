'use strict';

const STATUS_LABELS  = { draft:'Brouillon', validated:'Validé', sent:'Envoyé',
                          ordered:'Commandé', cancelled:'Annulé', archived:'Archivé' };
const STATUS_CLASSES = { draft:'badge-gray', validated:'badge-primary', sent:'badge-warning',
                          ordered:'badge-success', cancelled:'badge-danger', archived:'badge-gray' };
const TYPE_LABELS    = { devis:'Devis', offre:'Offre', commande:'Commande' };

async function loadDashboard() {
  if (!window.api) return;

  const res = await window.api.app.getDashboard();
  if (!res.ok) return;

  const d = res.data;

  // KPIs
  document.getElementById('kpi-revenue-month').textContent = formatPrice(d.revenueMonth);
  const pendingEl = document.getElementById('kpi-pending');
  pendingEl.textContent = d.pendingQuotes;
  if (d.overdueQuotes > 0) {
    pendingEl.innerHTML += ` <span title="${d.overdueQuotes} devis en retard de relance" style="font-size:14px;vertical-align:middle">⚠️</span>`;
  }
  document.getElementById('kpi-orders').textContent        = d.activeOrders;
  document.getElementById('kpi-drafts').textContent        = d.drafts;

  // Activité récente
  const tbody = document.getElementById('recent-docs');
  if (!d.recentDocs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Aucun document</td></tr>';
  } else {
    tbody.innerHTML = d.recentDocs.map(doc => `
      <tr>
        <td>
          ${doc.number
            ? `<span class="doc-num">${esc(doc.number)}</span>`
            : `<span class="doc-draft">Brouillon</span>`}
        </td>
        <td><span class="badge ${STATUS_CLASSES[doc.status] ?? 'badge-gray'}">${STATUS_LABELS[doc.status] ?? doc.status}</span></td>
        <td><span class="badge badge-gray">${TYPE_LABELS[doc.type] ?? doc.type}</span></td>
        <td><span class="doc-client">${doc.client_name ? esc(doc.client_name) : '<em style="color:#cbd5e1">—</em>'}</span></td>
        <td class="doc-amount">${formatPrice(doc.total)}</td>
        <td class="doc-date">${formatDate(doc.created_at)}</td>
      </tr>
    `).join('');
  }

  // Clients récents
  const clientsEl = document.getElementById('recent-clients');
  if (!d.recentClients.length) {
    clientsEl.innerHTML = '<div class="client-row"><div class="client-name" style="color:#94a3b8">Aucun client</div></div>';
  } else {
    clientsEl.innerHTML = d.recentClients.map(c => `
      <div class="client-row">
        <div class="client-name">${esc(c.name)}</div>
        <div class="client-detail">${c.company ? esc(c.company) : c.email ? esc(c.email) : ''}</div>
      </div>
    `).join('');
  }
}

function formatPrice(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadDashboard();
