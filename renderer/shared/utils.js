/**
 * Utils — Utilitaires côté renderer
 * Formatage, validation, helpers UI
 */

const Utils = {

  formatPrice(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount ?? 0);
  },

  formatDate(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  },

  slugify(text) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Affiche un toast de notification
  toast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container')
      || (() => {
        const el = document.createElement('div');
        el.id = 'toast-container';
        document.body.appendChild(el);
        return el;
      })();

    const icons = { success: '✓', error: '✕', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${Utils.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = '0.25s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Gestion des erreurs API
  handleApiError(result, context = '') {
    if (!result || !result.ok) {
      const msg = result?.errors?.join('\n') || result?.error || 'Erreur inconnue';
      console.error(`[${context}]`, msg);
      return msg;
    }
    return null;
  },
};

// Export global pour usage dans les pages
window.Utils = Utils;
