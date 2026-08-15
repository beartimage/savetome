-- Durable link-health scans. Queue messages contain only a random job ID; D1
-- owns progress and minimal per-link outcomes so scans survive closing the app.
CREATE TABLE IF NOT EXISTS link_health_jobs (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  total         INTEGER NOT NULL DEFAULT 0,
  processed     INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  broken_count  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  lease_until   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_link_health_jobs_user_created
  ON link_health_jobs(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_link_health_jobs_one_active
  ON link_health_jobs(user_id)
  WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS link_health_results (
  job_id      TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  item_id     TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('reachable','broken','unknown','invalid')),
  http_status INTEGER,
  reason      TEXT,
  checked_at  INTEGER NOT NULL,
  PRIMARY KEY (job_id, item_id),
  FOREIGN KEY (job_id) REFERENCES link_health_jobs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_link_health_results_user_job
  ON link_health_results(user_id, job_id, status);
