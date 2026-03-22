/**
 * Statistiques — Ventes, Produits, Fournisseurs
 */

'use strict';

let currentPeriod = 'all';

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
  setupPeriodNav();
  setupSectionTabs();
  loadStats('all');
  loadAdvancedStats();
});

// ==================== NAVIGATION PÉRIODE ====================

function setupPeriodNav() {
  document.querySelectorAll('.sidebar-item[data-period]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item[data-period]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentPeriod = item.dataset.period;

      const titles = {
        all:   'Statistiques globales',
        year:  'Statistiques — année en cours',
        month: 'Statistiques — mois en cours',
      };
      document.getElementById('page-title').textContent = titles[currentPeriod];
      loadStats(currentPeriod);
    });
  });
}

// ==================== ONGLETS SECTIONS ====================

function setupSectionTabs() {
  document.querySelectorAll('.section-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`section-${tab.dataset.section}`)?.classList.add('active');
    });
  });
}

// ==================== CHARGEMENT ====================

async function loadStats(period) {
  const indicator = document.getElementById('loading-indicator');
  indicator.textContent = 'Chargement…';
  indicator.style.display = 'inline';

  try {
    const res = await window.api.stats.get(period);
    if (!res.ok) { Utils.toast('Erreur chargement statistiques', 'error'); return; }
    render(res.data);
  } catch (e) {
    Utils.toast('Erreur : ' + e.message, 'error');
  } finally {
    indicator.style.display = 'none';
  }
}

// ==================== RENDU ====================

function render(data) {
  renderKPIs(data);
  renderChartMensuel(data.ventesParMois);
  renderRankList('rank-produits-qty', data.topProduits, 'count', d => `${d.count} unité${d.count > 1 ? 's' : ''}`, 'blue');
  renderRankList('rank-produits-ca',  data.topProduits.slice().sort((a,b) => b.ca - a.ca), 'ca', d => formatCA(d.ca), 'green');
  renderRankList('rank-sup-qty', data.topFournisseurs, 'count', d => `${d.count} unité${d.count > 1 ? 's' : ''}`, 'blue');
  renderRankList('rank-sup-ca',  data.topFournisseurs.slice().sort((a,b) => b.ca - a.ca), 'ca', d => formatCA(d.ca), 'green');
  renderFinitions(data);
}

// ── KPIs ──────────────────────────────────────────────────────────────────

function renderKPIs(data) {
  document.getElementById('kpi-ca').textContent        = formatCA(data.caTotal);
  document.getElementById('kpi-panier').textContent    = formatCA(data.panierMoyen);
  document.getElementById('kpi-taux').textContent      = `${data.txTransformation} %`;
  document.getElementById('kpi-commandes').textContent = data.nbCommandes;
  document.getElementById('kpi-devis').textContent     = data.nbDevisTotal;
  document.getElementById('kpi-devis-sub').textContent =
    data.nbCommandes === 1 ? 'commande passée' : 'commandes passées';
}

// ── Graphique mensuel ──────────────────────────────────────────────────────

function renderChartMensuel(mois) {
  const container = document.getElementById('chart-mensuel');
  container.innerHTML = '';

  if (!mois?.length) {
    container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">📊</div>Aucune donnée</div>';
    return;
  }

  const maxCA = Math.max(...mois.map(m => m.ca || 0), 1);
  const now   = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  mois.forEach(m => {
    const pct     = Math.round(((m.ca || 0) / maxCA) * 100);
    const isCurrent = m.month === currentMonth;
    const col     = document.createElement('div');
    col.className = 'bar-col';
    col.title     = `${m.label} : ${formatCA(m.ca || 0)} — ${m.nb} commande${m.nb > 1 ? 's' : ''}`;
    col.innerHTML = `
      <div class="bar-val">${m.ca > 0 ? formatCAShort(m.ca) : ''}</div>
      <div class="bar-fill${isCurrent ? ' current' : ''}" style="height:${Math.max(pct, m.ca > 0 ? 4 : 0)}%"></div>
      <div class="bar-label">${m.label}</div>
    `;
    container.appendChild(col);
  });
}

// ── Finitions & Options ───────────────────────────────────────────────────

function renderFinitions(data) {
  // KPIs mécanisme
  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setKpi('kpi-pct-relax',     `${data.pctRelax} %`);
  setKpi('kpi-relax-sub',     `${data.nbCmdRelax} commande${data.nbCmdRelax > 1 ? 's' : ''} / ${data.nbCommandes}`);
  setKpi('kpi-pct-mechanism', `${data.pctMechanism} %`);
  setKpi('kpi-mechanism-sub', `${data.nbLignesMechanism} ligne${data.nbLignesMechanism > 1 ? 's' : ''} / ${data.nbLignesTotal}`);
  setKpi('kpi-pct-fixe',      `${data.pctFixe} %`);
  setKpi('kpi-pct-avec-opt',  `${data.pctAvecOpt} %`);
  setKpi('kpi-opt-sub',       `${data.nbCmdAvecOptions} sur ${data.nbCommandes} commande${data.nbCommandes > 1 ? 's' : ''}`);

  // Classements
  renderRankList('rank-coloris',    data.topColoris,  'count', d => `× ${d.count}`, 'purple');
  renderRankList('rank-options',    data.topOptions,  'count', d => `× ${d.count}`, 'amber');
  renderRankList('rank-modules',    data.topModules,  'count', d => `× ${d.count}`, 'blue');
  renderRankListCA('rank-options-ca', data.topOptionsCA);
}

function renderRankListCA(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items?.length) {
    container.innerHTML = `
      <div class="stat-empty">
        <div class="stat-empty-icon">💰</div>
        <div>Données insuffisantes — les prix d'options doivent être renseignés dans le catalogue.</div>
      </div>`;
    return;
  }

  const maxCA = Math.max(...items.map(i => i.ca), 1);
  container.innerHTML = items.map((item, idx) => {
    const pct   = Math.round((item.ca / maxCA) * 100);
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    return `
      <div class="rank-item">
        <div class="rank-header">
          <div class="rank-name" title="${Utils.escapeHtml(item.name)}">
            <span style="margin-right:4px">${medal}</span>${Utils.escapeHtml(item.name)}
          </div>
          <div class="rank-meta" style="color:#059669;font-weight:700">${formatCA(item.ca)}</div>
        </div>
        <div class="rank-bar-bg">
          <div class="rank-bar-fill green" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Classements ───────────────────────────────────────────────────────────

function renderRankList(containerId, items, valueKey, labelFn, color) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items?.length) {
    container.innerHTML = `
      <div class="stat-empty">
        <div class="stat-empty-icon">📭</div>
        Aucune donnée pour cette période
      </div>`;
    return;
  }

  const maxVal = Math.max(...items.map(i => i[valueKey] || 0), 1);

  container.innerHTML = items.map((item, idx) => {
    const pct = Math.round(((item[valueKey] || 0) / maxVal) * 100);
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    return `
      <div class="rank-item">
        <div class="rank-header">
          <div class="rank-name" title="${Utils.escapeHtml(item.name)}">
            <span style="margin-right:4px">${medal}</span>${Utils.escapeHtml(item.name)}
          </div>
          <div class="rank-meta">${labelFn(item)}</div>
        </div>
        <div class="rank-bar-bg">
          <div class="rank-bar-fill ${color}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== STATS AVANCÉES ====================

async function loadAdvancedStats() {
  try {
    const res = await window.api.stats.getAdvanced();
    if (!res.ok) return;
    const d = res.data;
    renderHeatmap(d.seasonality);
    renderCombinaisons(d.topCombinations);
    renderAlertes(d.inactifProducts);
  } catch (e) {
    console.error('Stats avancées :', e);
  }
}

// ── Heatmap saisonnalité ──────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function renderHeatmap({ years, cells, maxCA }) {
  const container = document.getElementById('heatmap-container');

  if (!years?.length) {
    container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">📊</div>Aucune donnée</div>';
    return;
  }

  let html = '<table class="heatmap-table"><thead><tr><th></th>';
  years.forEach(y => { html += `<th>${y}</th>`; });
  html += '</tr></thead><tbody>';

  for (let m = 1; m <= 12; m++) {
    html += `<tr><td class="month-label">${MONTH_LABELS[m - 1]}</td>`;
    years.forEach(y => {
      const cell = cells[`${y}-${m}`];
      if (!cell) {
        html += '<td class="heatmap-cell heatmap-empty">·</td>';
      } else {
        const intensity = Math.min(cell.ca / maxCA, 1);
        // Couleur : de #e0f2fe (léger) à #1e40af (intense)
        const bg  = interpolateColor([224,242,254], [30,64,175], intensity);
        const fg  = intensity > 0.55 ? '#fff' : '#1e3a8a';
        const tip = `${MONTH_LABELS[m-1]} ${y} : ${formatCA(cell.ca)} — ${cell.nb} commande${cell.nb > 1 ? 's' : ''}`;
        html += `
          <td class="heatmap-cell" style="background:${bg};color:${fg}" title="${tip}">
            <div class="heatmap-cell-nb">${cell.nb}</div>
            <div class="heatmap-cell-ca">${formatCAShort(cell.ca)}</div>
          </td>`;
      }
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function interpolateColor(from, to, t) {
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Combinaisons ──────────────────────────────────────────────────────────

function renderCombinaisons(combos) {
  const container = document.getElementById('rank-combinaisons');
  if (!combos?.length) {
    container.innerHTML = `
      <div class="stat-empty">
        <div class="stat-empty-icon">🔗</div>
        Pas encore assez de commandes multi-produits pour calculer des combinaisons.
      </div>`;
    return;
  }

  const maxCount = combos[0].count;
  container.innerHTML = combos.map((c, idx) => {
    const [a, b]  = c.pair.split(' ＋ ');
    const pct     = Math.round((c.count / maxCount) * 100);
    const medal   = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    return `
      <div class="rank-item">
        <div class="rank-header">
          <div class="rank-name">
            <span style="margin-right:4px">${medal}</span>
            <span class="combo-pair">
              ${Utils.escapeHtml(a)}<span class="combo-pair-sep">+</span>${Utils.escapeHtml(b)}
            </span>
          </div>
          <div class="rank-meta">${c.count} fois ensemble</div>
        </div>
        <div class="rank-bar-bg">
          <div class="rank-bar-fill purple" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Alertes produits inactifs ─────────────────────────────────────────────

function renderAlertes(products) {
  const tbody   = document.getElementById('alertes-tbody');
  const empty   = document.getElementById('alertes-empty');
  const wrapper = document.getElementById('alertes-table-wrapper');
  const badge   = document.getElementById('badge-inactifs');

  badge.textContent = products.length;

  if (!products.length) {
    empty.style.display   = 'block';
    wrapper.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  wrapper.style.display = 'block';

  tbody.innerHTML = products.map(p => {
    const never = !p.lastOrderedAt;
    const monthsAgo = never ? null : monthsBetween(new Date(p.lastOrderedAt), new Date());
    const badgeHtml = never
      ? '<span class="badge badge-never">Jamais commandé</span>'
      : `<span class="badge badge-old">${monthsAgo} mois sans commande</span>`;
    const lastDate = never ? '—' : new Date(p.lastOrderedAt).toLocaleDateString('fr-FR');

    return `
      <tr>
        <td style="font-weight:600">${Utils.escapeHtml(p.name)}</td>
        <td style="color:var(--color-gray-500)">${Utils.escapeHtml(p.supplier_name || '—')}</td>
        <td style="color:var(--color-gray-500)">${Utils.escapeHtml(p.collection || '—')}</td>
        <td style="font-size:12px">${lastDate}</td>
        <td>${badgeHtml}</td>
      </tr>`;
  }).join('');
}

function monthsBetween(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24 * 30.44));
}

// ==================== FORMATAGE ====================

function formatCA(n) {
  if (!n) return '0 €';
  return Math.round(n).toLocaleString('fr-FR') + ' €';
}

function formatCAShort(n) {
  if (!n) return '';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return Math.round(n) + '';
}
