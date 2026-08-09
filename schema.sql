-- saveto.me D1 schema
-- Apply locally:  wrangler d1 execute savetome --local  --file=./schema.sql
-- Apply remote:   wrangler d1 execute savetome --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,   -- "<provider>:<providerUserId>"
  email      TEXT,
  name       TEXT,
  avatar     TEXT,
  provider   TEXT,
  created_at INTEGER
);

-- One JSON blob per user: the full app state (items + projects + meta).
CREATE TABLE IF NOT EXISTS state (
  user_id    TEXT PRIMARY KEY,
  blob       TEXT,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
