-- Ajout du coefficient spécifique par option
-- NULL = utilise le coefficient du produit (purchase_coefficient)
ALTER TABLE options ADD COLUMN coefficient REAL DEFAULT NULL;
