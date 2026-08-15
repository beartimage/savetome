-- Older production databases contain only users + the legacy state blob.
-- Create the per-object delta-sync tables before enabling the hardened Worker.
CREATE TABLE IF NOT EXISTS items (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  data       TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_items_user_updated ON items(user_id, updated_at);

CREATE TABLE IF NOT EXISTS settings (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Clamp legacy client-controlled timestamps before deploying the server-owned
-- sync clock. A device whose clock was far in the future must not freeze a row.
UPDATE items
SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE updated_at > (CAST(strftime('%s', 'now') AS INTEGER) * 1000) + 300000;

UPDATE settings
SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE updated_at > (CAST(strftime('%s', 'now') AS INTEGER) * 1000) + 300000;
