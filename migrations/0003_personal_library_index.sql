-- Personal Internet Library indexing layer.
-- Existing bookmark JSON in `items` remains the sync source of truth. This
-- additive schema provides normalized fields for search, enrichment, content
-- duplicate detection, semantic-vector bookkeeping, and Ask My Library.

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

CREATE INDEX IF NOT EXISTS idx_library_content_user_url
  ON library_content(user_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_library_content_user_hash
  ON library_content(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_library_content_user_status
  ON library_content(user_id, enrichment_status, updated_at);

-- D1 supports SQLite FTS5. user_id and item_id are stored for tenant isolation
-- and result lookup but do not participate in term matching.
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

CREATE INDEX IF NOT EXISTS idx_ask_history_user_created
  ON ask_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Backfill searchable metadata from existing non-deleted bookmark JSON. URL
-- normalization and page enrichment are refined lazily by the Worker later.
INSERT OR IGNORE INTO library_content (
  user_id, item_id, normalized_url, url, domain, title, description, note,
  tags, project, enrichment_status, updated_at
)
SELECT
  user_id,
  id,
  lower(COALESCE(json_extract(data, '$.normalizedUrl'), json_extract(data, '$.url'), '')),
  COALESCE(json_extract(data, '$.url'), ''),
  COALESCE(json_extract(data, '$.domain'), ''),
  COALESCE(json_extract(data, '$.title'), ''),
  COALESCE(json_extract(data, '$.description'), ''),
  COALESCE(json_extract(data, '$.note'), ''),
  COALESCE(json_extract(data, '$.autoTags'), '[]'),
  COALESCE(json_extract(data, '$.project'), ''),
  'pending',
  updated_at
FROM items
WHERE deleted = 0 AND data IS NOT NULL;

INSERT INTO library_fts (
  user_id, item_id, title, description, note, body_text, tags, project
)
SELECT
  user_id, item_id, title, description, note, body_text, tags, project
FROM library_content
WHERE NOT EXISTS (
  SELECT 1 FROM library_fts f
  WHERE f.user_id = library_content.user_id
    AND f.item_id = library_content.item_id
);
