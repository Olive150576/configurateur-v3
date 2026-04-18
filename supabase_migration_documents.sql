-- ============================================================
-- Migration Supabase — Documents & Compositions
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- Table documents
CREATE TABLE IF NOT EXISTS documents (
  id               TEXT PRIMARY KEY,
  number           TEXT UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('devis', 'offre', 'commande')),
  status           TEXT NOT NULL DEFAULT 'draft',
  client_id        TEXT REFERENCES clients(id),
  client_snapshot  JSONB NOT NULL DEFAULT '{}',
  product_snapshot JSONB NOT NULL DEFAULT '{}',
  subtotal         NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount_amount  NUMERIC NOT NULL DEFAULT 0,
  total            NUMERIC NOT NULL DEFAULT 0,
  deposit_percent  NUMERIC NOT NULL DEFAULT 0,
  deposit_amount   NUMERIC NOT NULL DEFAULT 0,
  balance          NUMERIC NOT NULL DEFAULT 0,
  notes            TEXT DEFAULT '',
  parent_id        TEXT REFERENCES documents(id),
  composition_svg  TEXT,
  composition_json TEXT,
  product_photo    TEXT,
  validated_at     TIMESTAMPTZ,
  ordered_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_client  ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type    ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

-- Table numérotation séquentielle
CREATE TABLE IF NOT EXISTS document_counters (
  type        TEXT    NOT NULL,
  year        INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (type, year)
);

-- Fonction Postgres pour génération atomique des numéros
CREATE OR REPLACE FUNCTION generate_document_number(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year   INTEGER;
  v_prefix TEXT;
  v_number INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  v_prefix := CASE p_type
    WHEN 'devis'    THEN 'DEV'
    WHEN 'offre'    THEN 'OFF'
    WHEN 'commande' THEN 'CMD'
    ELSE 'DOC'
  END;

  INSERT INTO document_counters (type, year, last_number)
  VALUES (p_type, v_year, 1)
  ON CONFLICT (type, year)
  DO UPDATE SET last_number = document_counters.last_number + 1
  RETURNING last_number INTO v_number;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_number::TEXT, 4, '0');
END;
$$;

-- Table compositions
CREATE TABLE IF NOT EXISTS compositions (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  product_id    TEXT,
  modules_json  TEXT NOT NULL DEFAULT '[]',
  thumbnail_svg TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
