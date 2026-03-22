-- Migration 006 — Champs contacts étendus pour les fournisseurs

ALTER TABLE suppliers ADD COLUMN address       TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN city          TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN zip           TEXT DEFAULT '';

-- Contact régulier (le champ "contact" existant = nom du contact régulier)
ALTER TABLE suppliers ADD COLUMN contact_phone TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN contact_email TEXT DEFAULT '';

-- Commercial qui visite
ALTER TABLE suppliers ADD COLUMN commercial_name  TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN commercial_phone TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN commercial_email TEXT DEFAULT '';

-- Contact SAV
ALTER TABLE suppliers ADD COLUMN sav_name  TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN sav_phone TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN sav_email TEXT DEFAULT '';
