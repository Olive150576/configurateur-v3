-- Migration 014 — Composition visuelle dans les documents
ALTER TABLE documents ADD COLUMN composition_svg  TEXT DEFAULT NULL;
ALTER TABLE documents ADD COLUMN composition_json TEXT DEFAULT NULL;
