CREATE TABLE IF NOT EXISTS drafts (
  id                TEXT PRIMARY KEY,           -- uuid v4, generated in app code
  slug              TEXT UNIQUE,                -- null until first publish
  title             TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  body_markdown     TEXT NOT NULL DEFAULT '',
  tags              TEXT NOT NULL DEFAULT '[]', -- JSON array string (SQLite has no array type)
  cover_image_path  TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','archived')),
  github_path       TEXT,                       -- e.g. src/content/posts/my-slug.md
  github_sha        TEXT,                       -- last known blob sha, for optimistic concurrency
  created_by        TEXT NOT NULL,              -- writer email from Access JWT
  updated_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at);
