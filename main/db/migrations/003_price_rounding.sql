-- Migration 003 — Mode d'arrondi du prix de vente sur les produits
-- 'none' = pas d'arrondi | 'integer' = à l'euro | 'ten' = à la dizaine
ALTER TABLE products ADD COLUMN price_rounding TEXT NOT NULL DEFAULT 'none';
