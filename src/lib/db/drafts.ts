import type { DraftInput } from '../schemas/draft';

export type DraftStatus = 'draft' | 'published' | 'archived';

export interface Draft {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  bodyMarkdown: string;
  tags: string[];
  coverImagePath: string | null;
  status: DraftStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  // A frozen snapshot of what's actually live, distinct from the editable
  // fields above — see src/lib/db/posts.ts and markDraftPublished. Null
  // until the draft has been published at least once.
  publishedTitle: string | null;
  publishedDescription: string | null;
  publishedBodyMarkdown: string | null;
  publishedTags: string[] | null;
  publishedCoverImagePath: string | null;
  publishedUpdatedAt: string | null;
}

export interface DraftRow {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  body_markdown: string;
  tags: string;
  cover_image_path: string | null;
  status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  published_title: string | null;
  published_description: string | null;
  published_body_markdown: string | null;
  published_tags: string | null;
  published_cover_image_path: string | null;
  published_updated_at: string | null;
}

function parseTagsJson(value: string | null): string[] | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return null;
  }
}

export function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    bodyMarkdown: row.body_markdown,
    tags: parseTagsJson(row.tags) ?? [],
    coverImagePath: row.cover_image_path,
    status: row.status as DraftStatus,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    publishedTitle: row.published_title,
    publishedDescription: row.published_description,
    publishedBodyMarkdown: row.published_body_markdown,
    publishedTags: parseTagsJson(row.published_tags),
    publishedCoverImagePath: row.published_cover_image_path,
    publishedUpdatedAt: row.published_updated_at,
  };
}

export async function createDraft(db: D1Database, createdBy: string): Promise<Draft> {
  const id = crypto.randomUUID();

  const row = await db
    .prepare(
      `INSERT INTO drafts (id, created_by, updated_by)
       VALUES (?1, ?2, ?2)
       RETURNING *`,
    )
    .bind(id, createdBy)
    .first<DraftRow>();

  if (!row) throw new Error('Failed to create draft');
  return rowToDraft(row);
}

export async function getDraft(db: D1Database, id: string): Promise<Draft | null> {
  const row = await db.prepare('SELECT * FROM drafts WHERE id = ?1').bind(id).first<DraftRow>();
  return row ? rowToDraft(row) : null;
}

/** Never includes trashed drafts — see listTrashedDrafts for those. */
export async function listDrafts(db: D1Database, status?: DraftStatus): Promise<Draft[]> {
  const { results } = status
    ? await db
        .prepare('SELECT * FROM drafts WHERE status = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC')
        .bind(status)
        .all<DraftRow>()
    : await db.prepare('SELECT * FROM drafts WHERE deleted_at IS NULL ORDER BY updated_at DESC').all<DraftRow>();

  return results.map(rowToDraft);
}

export async function listTrashedDrafts(db: D1Database): Promise<Draft[]> {
  const { results } = await db
    .prepare('SELECT * FROM drafts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all<DraftRow>();

  return results.map(rowToDraft);
}

export async function updateDraft(
  db: D1Database,
  id: string,
  input: Partial<DraftInput>,
  updatedBy: string,
): Promise<Draft | null> {
  const setClauses: string[] = ['updated_by = ?', "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
  const values: unknown[] = [updatedBy];

  if (input.title !== undefined) {
    setClauses.push('title = ?');
    values.push(input.title);
  }
  if (input.description !== undefined) {
    setClauses.push('description = ?');
    values.push(input.description);
  }
  if (input.bodyMarkdown !== undefined) {
    setClauses.push('body_markdown = ?');
    values.push(input.bodyMarkdown);
  }
  if (input.tags !== undefined) {
    setClauses.push('tags = ?');
    values.push(JSON.stringify(input.tags));
  }
  if (input.coverImagePath !== undefined) {
    setClauses.push('cover_image_path = ?');
    values.push(input.coverImagePath);
  }

  values.push(id);

  const row = await db
    .prepare(`UPDATE drafts SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first<DraftRow>();

  return row ? rowToDraft(row) : null;
}

/**
 * Soft-delete: moves a never-published draft to trash rather than removing
 * it, so it can be restored or purged later. A published post's row is
 * never trashed this way — see markDraftUnpublished for withdrawing a live
 * post.
 */
export async function trashDraft(db: D1Database, id: string, updatedBy: string): Promise<Draft | null> {
  const row = await db
    .prepare(
      `UPDATE drafts
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by = ?1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?2 AND status = 'draft' AND deleted_at IS NULL
       RETURNING *`,
    )
    .bind(updatedBy, id)
    .first<DraftRow>();

  return row ? rowToDraft(row) : null;
}

export async function restoreDraft(db: D1Database, id: string, updatedBy: string): Promise<Draft | null> {
  const row = await db
    .prepare(
      `UPDATE drafts
       SET deleted_at = NULL, updated_by = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?2 AND deleted_at IS NOT NULL
       RETURNING *`,
    )
    .bind(updatedBy, id)
    .first<DraftRow>();

  return row ? rowToDraft(row) : null;
}

/** Permanently removes a draft's row — only ever a trashed draft, so this can't be reached by accident from the normal editor flow. */
export async function purgeDraft(db: D1Database, id: string): Promise<boolean> {
  const { meta } = await db
    .prepare("DELETE FROM drafts WHERE id = ?1 AND status = 'draft' AND deleted_at IS NOT NULL")
    .bind(id)
    .run();
  return meta.changes > 0;
}

/** Empties the trash in one go. Returns how many drafts were removed, for the confirmation UI and audit log. */
export async function purgeAllTrashedDrafts(db: D1Database): Promise<number> {
  const { meta } = await db.prepare("DELETE FROM drafts WHERE status = 'draft' AND deleted_at IS NOT NULL").run();
  return meta.changes;
}

/**
 * This is the moment a draft's current edits become the live, public
 * snapshot — D1 is the sole source of truth (see docs/architecture.md), so
 * unlike a git-backed pipeline there's no external commit this depends on.
 * Copies the editable title/description/body_markdown/tags/cover_image_path
 * columns into their published_* counterparts, which is what the public
 * site actually reads (src/lib/db/posts.ts) — so further autosaved edits
 * after this point do NOT go live until Publish/Update is clicked again.
 *
 * A single JS-computed timestamp (not several separate `strftime('now')`
 * calls) is bound for every "now" column below, so published_at and
 * published_updated_at are guaranteed byte-identical on a first publish —
 * that equality is exactly how callers distinguish "just published" from
 * "has been updated since" (see PostLayout.astro).
 */
export async function markDraftPublished(
  db: D1Database,
  id: string,
  fields: { slug: string },
  updatedBy: string,
): Promise<Draft | null> {
  const now = new Date().toISOString();

  const row = await db
    .prepare(
      `UPDATE drafts
       SET status = 'published',
           slug = ?1,
           published_title = title,
           published_description = description,
           published_body_markdown = body_markdown,
           published_tags = tags,
           published_cover_image_path = cover_image_path,
           published_updated_at = ?2,
           updated_by = ?3,
           updated_at = ?2,
           published_at = COALESCE(published_at, ?2)
       WHERE id = ?4
       RETURNING *`,
    )
    .bind(fields.slug, now, updatedBy, id)
    .first<DraftRow>();

  return row ? rowToDraft(row) : null;
}

/** Marks a previously-published post as withdrawn. Retains slug/published_at/published_* snapshot as history — only status changes. */
export async function markDraftUnpublished(db: D1Database, id: string, updatedBy: string): Promise<Draft | null> {
  const row = await db
    .prepare(
      `UPDATE drafts
       SET status = 'archived', updated_by = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?2 AND status = 'published'
       RETURNING *`,
    )
    .bind(updatedBy, id)
    .first<DraftRow>();

  return row ? rowToDraft(row) : null;
}
