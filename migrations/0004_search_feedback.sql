-- Per-user relevance feedback. A dismissal applies only to the normalized
-- query that produced it, so rejecting one result never hides the bookmark
-- from unrelated searches or from the library itself.
CREATE TABLE IF NOT EXISTS search_feedback (
  user_id    TEXT    NOT NULL,
  query_key  TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  signal     TEXT    NOT NULL CHECK (signal IN ('not_relevant')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query_key, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_search_feedback_user_query
  ON search_feedback(user_id, query_key, created_at DESC);
