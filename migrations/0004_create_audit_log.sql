CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email  TEXT NOT NULL,        -- verified `email` claim from Access JWT
  action       TEXT NOT NULL,        -- e.g. 'post.publish', 'post.unpublish', 'draft.create'
  target_type  TEXT NOT NULL,        -- 'post' | 'draft' | 'media'
  target_id    TEXT,                 -- slug or draft id
  metadata     TEXT,                 -- JSON blob, e.g. {"github_commit_sha": "..."}
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_email);
