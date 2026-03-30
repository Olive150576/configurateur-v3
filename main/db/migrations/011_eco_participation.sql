-- 011_eco_participation.sql
-- Éco-participation Éco-mobilier par produit (montant HT)
ALTER TABLE products ADD COLUMN eco_participation REAL DEFAULT 0;
