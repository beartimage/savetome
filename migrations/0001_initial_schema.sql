-- Baseline schema for fresh installations. The original production database was
-- initialized from schema.sql before Wrangler migration tracking was introduced;
-- every statement is idempotent so this migration is also safe there.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT,
  name       TEXT,
  avatar     TEXT,
  provider   TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS state (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS items (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  data       TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_items_user_updated
  ON items(user_id, updated_at);

CREATE TABLE IF NOT EXISTS settings (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
