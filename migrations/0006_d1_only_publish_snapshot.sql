-- Published posts are now D1-only (see docs/architecture.md) — there is no
-- longer a GitHub commit to track a blob sha or repo path for.
ALTER TABLE drafts DROP COLUMN github_path;
ALTER TABLE drafts DROP COLUMN github_sha;

-- Two-phase publish, now entirely within D1: the existing title/description/
-- body_markdown/tags/cover_image_path columns remain the writer's always-
-- editable working copy (autosaved on every keystroke). These published_*
-- columns are a frozen snapshot of what's actually live — only overwritten
-- by markDraftPublished when the writer explicitly clicks Publish/Update
-- again, so in-progress edits to an already-published post never go live
-- on their own.
ALTER TABLE drafts ADD COLUMN published_title TEXT;
ALTER TABLE drafts ADD COLUMN published_description TEXT;
ALTER TABLE drafts ADD COLUMN published_body_markdown TEXT;
ALTER TABLE drafts ADD COLUMN published_tags TEXT;
ALTER TABLE drafts ADD COLUMN published_cover_image_path TEXT;
-- Distinct from published_at (which never changes after the first publish,
-- per markDraftPublished's COALESCE) — this one moves on every republish,
-- so the public post page can tell "first published" from "last updated".
ALTER TABLE drafts ADD COLUMN published_updated_at TEXT;
