-- Migration 015 — Photo produit optionnelle dans les documents
ALTER TABLE documents ADD COLUMN product_photo TEXT DEFAULT NULL;
