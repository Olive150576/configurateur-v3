/**
 * Validator — Validation métier centralisée (main process)
 * Toutes les règles métier critiques sont ici.
 * La UI peut pré-valider pour l'UX, mais c'est ici que ça compte.
 */

class ValidationError extends Error {
  constructor(errors) {
    super(Array.isArray(errors) ? errors.join('\n') : errors);
    this.name = 'ValidationError';
    this.errors = Array.isArray(errors) ? errors : [errors];
  }
}

// ==================== PRODUIT ====================

function validateProduct(product) {
  const errors = [];

  if (!product.id?.trim()) errors.push('ID produit obligatoire');
  if (!product.name?.trim()) errors.push('Nom produit obligatoire');

  if (!product.ranges || product.ranges.length === 0) {
    errors.push('Au moins une gamme requise');
  } else {
    product.ranges.forEach((r, i) => {
      if (!r.id?.trim() || !r.name?.trim())
        errors.push(`Gamme ${i + 1}: id et nom obligatoires`);
      if (typeof r.base_price !== 'number' || r.base_price < 0)
        errors.push(`Gamme "${r.name}": prix de base invalide`);
    });
  }

  if (!product.modules || product.modules.length === 0) {
    errors.push('Au moins un module requis');
  } else {
    product.modules.forEach((m, i) => {
      if (!m.id?.trim() || !m.name?.trim())
        errors.push(`Module ${i + 1}: id et nom obligatoires`);
      if (!m.prices || Object.keys(m.prices).length === 0)
        errors.push(`Module "${m.name}": tarif par gamme obligatoire`);
    });
  }

  if (product.options) {
    product.options.forEach((o, i) => {
      if (!o.id?.trim() || !o.name?.trim())
        errors.push(`Option ${i + 1}: id et nom obligatoires`);
      if (typeof o.price !== 'number' || o.price < 0)
        errors.push(`Option "${o.name}": prix invalide`);
    });
  }

  if (errors.length > 0) throw new ValidationError(errors);
}

// ==================== DOCUMENT ====================

function validateDocument(doc) {
  const errors = [];

  if (!doc.type || !['devis', 'offre', 'commande'].includes(doc.type))
    errors.push('Type de document invalide');

  if (typeof doc.subtotal !== 'number' || doc.subtotal < 0)
    errors.push('Sous-total invalide');

  if (typeof doc.discount_percent !== 'number' ||
      doc.discount_percent < 0 || doc.discount_percent > 100)
    errors.push('Pourcentage de remise invalide (0-100)');

  if (doc.discount_amount > doc.subtotal)
    errors.push('La remise ne peut pas dépasser le sous-total');

  if (typeof doc.total !== 'number' || doc.total < 0)
    errors.push('Total invalide');

  // Vérification cohérence total
  const expectedTotal = doc.subtotal - doc.discount_amount;
  if (Math.abs(doc.total - expectedTotal) > 0.01)
    errors.push('Incohérence: total ≠ sous-total − remise');

  if (doc.deposit_amount > doc.total)
    errors.push("L'acompte ne peut pas dépasser le total");

  // Vérification cohérence solde
  const expectedBalance = doc.total - doc.deposit_amount;
  if (Math.abs(doc.balance - expectedBalance) > 0.01)
    errors.push('Incohérence: solde ≠ total − acompte');

  if (errors.length > 0) throw new ValidationError(errors);
}

// ==================== TRANSITIONS DOCUMENT ====================

const ALLOWED_TRANSITIONS = {
  draft:     ['validated', 'cancelled'],
  validated: ['sent', 'ordered', 'cancelled', 'archived'],
  sent:      ['ordered', 'cancelled', 'archived'],
  ordered:   ['archived'],
  cancelled: ['archived'],
  archived:  [],
};

function validateTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from]) {
    throw new ValidationError(`Statut inconnu: ${from}`);
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(
      `Transition interdite: ${from} → ${to}`
    );
  }
}

// ==================== CLIENT ====================

function validateClient(client) {
  const errors = [];

  if (!client.name?.trim()) errors.push('Nom client obligatoire');

  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email))
    errors.push('Email invalide');

  if (errors.length > 0) throw new ValidationError(errors);
}

module.exports = {
  ValidationError,
  validateProduct,
  validateDocument,
  validateTransition,
  validateClient,
};
