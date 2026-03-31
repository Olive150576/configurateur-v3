-- Migration 012 : Supprimer la FK locale client_id sur documents
-- Les clients sont dans Supabase, pas dans le SQLite local.
-- La contrainte REFERENCES clients(id) échoue dès qu'un client Supabase
-- est sélectionné. Le client_snapshot contient toutes les données nécessaires.

CREATE TABLE IF NOT EXISTS documents_v2 (
  id               TEXT PRIMARY KEY,
  number           TEXT UNIQUE,
  type             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  client_id        TEXT,
  client_snapshot  TEXT NOT NULL DEFAULT '{}',
  product_snapshot TEXT NOT NULL DEFAULT '{}',
  subtotal         REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  discount_amount  REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  deposit_percent  REAL NOT NULL DEFAULT 0,
  deposit_amount   REAL NOT NULL DEFAULT 0,
  balance          REAL NOT NULL DEFAULT 0,
  notes            TEXT DEFAULT '',
  parent_id        TEXT REFERENCES documents_v2(id),
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now')),
  validated_at     TEXT DEFAULT NULL,
  ordered_at       TEXT DEFAULT NULL
);

INSERT INTO documents_v2 SELECT * FROM documents;
DROP TABLE documents;
ALTER TABLE documents_v2 RENAME TO documents;

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type   ON documents(type);
