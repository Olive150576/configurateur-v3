/**
 * pricing.js — Fonctions de calcul de prix partagées entre toutes les pages
 * Inclus via <script> dans chaque HTML (pas de module ES).
 * Toutes les fonctions sont globales.
 */

/** Arrondi à 2 décimales */
function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Applique le mode d'arrondi du produit au prix de vente TTC.
 * @param {number} price
 * @param {'none'|'integer'|'ten'} mode
 */
function applyRounding(price, mode) {
  if (mode === 'integer') return Math.round(price);
  if (mode === 'ten')     return Math.round(price / 10) * 10;
  return round2(price);
}

/**
 * Retourne l'éco-participation applicable selon la priorité :
 * module > range > produit.
 * @param {object} product   — objet produit avec eco_participation
 * @param {object|null} range    — objet gamme avec eco_participation (peut être null)
 * @param {object|null} moduleObj — objet module avec eco_participation (peut être null)
 */
function getEco(product, range, moduleObj) {
  if (moduleObj && moduleObj.eco_participation > 0) return moduleObj.eco_participation;
  if (range    && range.eco_participation > 0)      return range.eco_participation;
  return (product && product.eco_participation) || 0;
}

/**
 * Prix de vente TTC d'un article (PA × coeff, arrondi).
 * La TVA est déjà incluse dans le coefficient d'achat.
 * @param {number} purchasePrice — prix achat HT
 * @param {number} coeff         — coefficient d'achat
 * @param {string} rounding      — mode d'arrondi
 */
function salePrice(purchasePrice, coeff, rounding) {
  return applyRounding((purchasePrice || 0) * coeff, rounding);
}

/**
 * Retourne le coefficient à appliquer pour une option.
 * Utilise le coefficient propre à l'option si défini, sinon celui du produit.
 * @param {object} option       — objet option avec coefficient nullable
 * @param {number} productCoeff — coefficient du produit
 */
function getOptionCoeff(option, productCoeff) {
  return (option.coefficient != null && option.coefficient > 0)
    ? option.coefficient
    : productCoeff;
}
