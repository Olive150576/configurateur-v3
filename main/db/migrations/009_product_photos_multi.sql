-- 009_product_photos_multi.sql
-- Photos multiples par produit (cache local SQLite pour backup offline)
CREATE TABLE IF NOT EXISTS product_photos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  photo TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_photos_product
  ON product_photos(product_id, sort_order);
