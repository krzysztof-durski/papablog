-- Soft-delete for drafts: "delete" moves a draft to trash (deleted_at set)
-- rather than removing the row, so it can be restored or manually purged
-- later instead of being lost immediately.
ALTER TABLE drafts ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_drafts_deleted_at ON drafts(deleted_at);
