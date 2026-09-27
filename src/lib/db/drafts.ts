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
  githubPath: string | null;
  githubSha: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface DraftRow {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  body_markdown: string;
  tags: string;
  cover_image_path: string | null;
  status: string;
  github_path: string | null;
  github_sha: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

function rowToDraft(row: DraftRow): Draft {
  let tags: string[];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    bodyMarkdown: row.body_markdown,
    tags,
    coverImagePath: row.cover_image_path,
    status: row.status as DraftStatus,
    githubPath: row.github_path,
    githubSha: row.github_sha,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
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

export async function listDrafts(db: D1Database, status?: DraftStatus): Promise<Draft[]> {
  const { results } = status
    ? await db.prepare('SELECT * FROM drafts WHERE status = ?1 ORDER BY updated_at DESC').bind(status).all<DraftRow>()
    : await db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC').all<DraftRow>();

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

/** Only ever deletes a draft that has never been published — a published post's row stays as a record. */
export async function deleteDraft(db: D1Database, id: string): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM drafts WHERE id = ?1 AND status = 'draft'").bind(id).run();
  return meta.changes > 0;
}
