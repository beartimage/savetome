-- Authenticated, privacy-minimal client error journal. It stores no bookmark
-- URL, query text, page content, email, or access token.
CREATE TABLE IF NOT EXISTS client_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  scope       TEXT    NOT NULL,
  error_name  TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  app_version TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_errors_user_created
  ON client_errors(user_id, created_at DESC);

-- Positive search learning lives separately because the original feedback
-- table intentionally has a CHECK limited to `not_relevant`.
CREATE TABLE IF NOT EXISTS search_positive_feedback (
  user_id    TEXT    NOT NULL,
  query_key  TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query_key, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_search_positive_user_query
  ON search_positive_feedback(user_id, query_key, created_at DESC);
