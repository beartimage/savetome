-- saveto.me D1 schema
-- Apply locally:  wrangler d1 execute d1savetome --local  --file=./schema.sql
-- Apply remote:   wrangler d1 execute d1savetome --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,   -- "<provider>:<providerUserId>"
  email      TEXT,
  name       TEXT,
  avatar     TEXT,
  provider   TEXT,
  created_at INTEGER
);

-- Legacy: one JSON blob per user (full app state). Retained only so existing
-- accounts can be migrated to the per-object tables below on first sync.
CREATE TABLE IF NOT EXISTS state (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Per-bookmark rows for delta sync. Each edit carries its own updated_at, so
-- concurrent changes on different devices merge per object instead of one
-- device's full-library push clobbering the other (last-write-wins per row).
-- deleted=1 rows are tombstones: they propagate a deletion to other devices
-- and are kept (not hard-deleted) so a stale device can't resurrect the item.
CREATE TABLE IF NOT EXISTS items (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,   -- the bookmark's client id, as text
  data       TEXT,               -- JSON of the bookmark (NULL when deleted=1)
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_items_user_updated ON items(user_id, updated_at);

-- Small per-user blob for projects/tags/view settings. These are tiny and
-- rarely edited concurrently, so a versioned last-write-wins blob is fine.
CREATE TABLE IF NOT EXISTS settings (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
