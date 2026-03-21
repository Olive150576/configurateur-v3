-- 004_product_photos.sql
-- Ajout photo produit et notes fournisseur
ALTER TABLE products ADD COLUMN photo TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN supplier_notes TEXT DEFAULT '';
