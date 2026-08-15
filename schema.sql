-- saveto.me D1 schema
-- Apply locally:  wrangler d1 execute d1savetome --local  --file=./schema.sql
-- Apply remote:   wrangler d1 execute d1savetome --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,   -- "<provider>:<providerUserId>"
  email      TEXT,
  name       TEXT,
  avatar     TEXT,
  provider   TEXT,
  created_at INTEGER,
  token_version INTEGER NOT NULL DEFAULT 0  -- bumped on logout to revoke sessions
);

-- Legacy: one JSON blob per user (full app state). Retained only so existing
-- accounts can be migrated to the per-object tables below on first sync.
CREATE TABLE IF NOT EXISTS state (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Per-bookmark rows for delta sync. The server assigns updated_at to each edit, so
-- concurrent changes on different devices merge per object instead of one
-- device's full-library push clobbering the other (last-write-wins per row).
-- deleted=1 rows are tombstones: they propagate a deletion to other devices
-- and are kept (not hard-deleted) so a stale device can't resurrect the item.
CREATE TABLE IF NOT EXISTS items (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,   -- the bookmark's client id, as text
  data       TEXT,               -- JSON of the bookmark (NULL when deleted=1)
  updated_at INTEGER NOT NULL, -- server-owned conflict/sync timestamp
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

-- Search/enrichment projection. `items.data` remains the sync source of truth;
-- this table is rebuilt or updated by the Worker as bookmarks change.
CREATE TABLE IF NOT EXISTS library_content (
  user_id           TEXT    NOT NULL,
  item_id           TEXT    NOT NULL,
  normalized_url    TEXT    NOT NULL DEFAULT '',
  url               TEXT    NOT NULL DEFAULT '',
  domain            TEXT    NOT NULL DEFAULT '',
  title             TEXT    NOT NULL DEFAULT '',
  description       TEXT    NOT NULL DEFAULT '',
  note              TEXT    NOT NULL DEFAULT '',
  body_text         TEXT    NOT NULL DEFAULT '',
  tags              TEXT    NOT NULL DEFAULT '',
  project           TEXT    NOT NULL DEFAULT '',
  category          TEXT    NOT NULL DEFAULT '',
  language          TEXT    NOT NULL DEFAULT '',
  content_hash      TEXT,
  vector_id         TEXT,
  enrichment_status TEXT    NOT NULL DEFAULT 'pending',
  enriched_at       INTEGER,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_library_content_user_url ON library_content(user_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_library_content_user_hash ON library_content(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_library_content_user_status ON library_content(user_id, enrichment_status, updated_at);

CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
  user_id UNINDEXED,
  item_id UNINDEXED,
  title,
  description,
  note,
  body_text,
  tags,
  project,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS ask_history (
  id         TEXT PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  question   TEXT    NOT NULL,
  answer     TEXT    NOT NULL,
  sources    TEXT    NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ask_history_user_created ON ask_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
