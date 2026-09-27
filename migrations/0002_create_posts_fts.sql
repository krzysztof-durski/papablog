-- Standalone FTS5 table (not external-content-linked): D1 is a search cache,
-- git (src/content/posts/*.md) is the source of truth. Rebuilt/reconciled
-- via the future /api/admin/search-reindex endpoint if it ever drifts.
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  slug UNINDEXED,
  title,
  body,
  tags,
  published_at UNINDEXED,
  tokenize = 'porter unicode61'
);
