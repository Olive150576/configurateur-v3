-- Migration 002 — Coefficient de vente sur les produits
-- Les prix stockés (gammes, modules, options) sont des prix d'achat HT.
-- Le coefficient est appliqué dans le configurateur pour obtenir le prix de vente.
ALTER TABLE products ADD COLUMN purchase_coefficient REAL NOT NULL DEFAULT 2.0;
