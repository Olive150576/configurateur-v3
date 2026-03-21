-- Migration 001 — Schéma initial complet

-- FOURNISSEURS
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- PRODUITS
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  collection TEXT DEFAULT '',
  description TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  archived INTEGER DEFAULT 0,
  valid_from TEXT DEFAULT NULL,
  valid_until TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- GAMMES (variante tarifaire d'un produit)
CREATE TABLE IF NOT EXISTS ranges (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_price REAL NOT NULL CHECK(base_price >= 0),
  sort_order INTEGER DEFAULT 0
);

-- MODULES (éléments composables, prix par gamme)
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- PRIX DES MODULES PAR GAMME
CREATE TABLE IF NOT EXISTS module_prices (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  range_id TEXT NOT NULL REFERENCES ranges(id) ON DELETE CASCADE,
  price REAL NOT NULL CHECK(price >= 0),
  PRIMARY KEY (module_id, range_id)
);

-- OPTIONS / FINITIONS
CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL CHECK(price >= 0),
  type TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- DOCUMENTS (devis / offre / commande)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE,                 -- NULL tant que brouillon, attribué à la validation
  type TEXT NOT NULL,                 -- 'devis' | 'offre' | 'commande'
  status TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'validated' | 'sent' | 'ordered' | 'cancelled' | 'archived'
  client_id TEXT REFERENCES clients(id),
  client_snapshot TEXT NOT NULL DEFAULT '{}',   -- JSON snapshot client
  product_snapshot TEXT NOT NULL DEFAULT '{}',  -- JSON config complète figée
  subtotal REAL NOT NULL DEFAULT 0 CHECK(subtotal >= 0),
  discount_percent REAL NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
  deposit_percent REAL NOT NULL DEFAULT 0 CHECK(deposit_percent >= 0 AND deposit_percent <= 100),
  deposit_amount REAL NOT NULL DEFAULT 0 CHECK(deposit_amount >= 0),
  balance REAL NOT NULL DEFAULT 0 CHECK(balance >= 0),
  notes TEXT DEFAULT '',
  parent_id TEXT REFERENCES documents(id),      -- lien devis → commande
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  validated_at TEXT DEFAULT NULL,
  ordered_at TEXT DEFAULT NULL
);

-- NUMÉROTATION SÉQUENTIELLE PAR TYPE ET ANNÉE
CREATE TABLE IF NOT EXISTS document_counters (
  type TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (type, year)
);

-- LOGS D'ACTIONS (audit local)
CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- CONFIGURATION APPLICATION
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- CONFIG PAR DÉFAUT
INSERT OR IGNORE INTO app_config (key, value) VALUES
  ('company_name', 'Votre Entreprise'),
  ('company_address', ''),
  ('company_city', ''),
  ('company_phone', ''),
  ('company_email', ''),
  ('company_siret', ''),
  ('company_vat', ''),
  ('default_discount', '0'),
  ('default_deposit', '30'),
  ('currency', '€'),
  ('vat_rate', '20');

-- INDEX POUR LES RECHERCHES
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, archived);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_action_logs_entity ON action_logs(entity_type, entity_id);
