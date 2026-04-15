CREATE TABLE IF NOT EXISTS compositions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  product_id    TEXT,
  modules_json  TEXT NOT NULL DEFAULT '[]',
  thumbnail_svg TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compositions_product ON compositions(product_id);
