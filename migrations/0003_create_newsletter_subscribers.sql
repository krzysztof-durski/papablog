CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  email                    TEXT NOT NULL UNIQUE,   -- stored lowercased/trimmed
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','confirmed','unsubscribed')),
  confirm_token            TEXT UNIQUE,
  confirm_token_expires_at TEXT,
  confirmed_at             TEXT,
  unsubscribe_token        TEXT NOT NULL UNIQUE,   -- long-lived, one-click unsubscribe
  signup_ip_hash           TEXT,                   -- salted hash, never raw IP
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unsubscribed_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
