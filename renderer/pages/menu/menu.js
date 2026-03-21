// Charger les stats depuis la base
async function loadStats() {
  if (!window.api) return;
  const res = await window.api.app.getStats();
  if (res.ok) {
    document.getElementById('stat-products').textContent  = res.data.products;
    document.getElementById('stat-clients').textContent   = res.data.clients;
    document.getElementById('stat-documents').textContent = res.data.documents;
    document.getElementById('stat-drafts').textContent    = res.data.drafts;
  }
}

loadStats();
