import type { DraftRow } from './drafts';

/**
 * A published post, as actually rendered to the public — always built from
 * a draft row's frozen `published_*` snapshot columns (see markDraftPublished
 * in drafts.ts), never its always-editable title/description/body_markdown
 * columns. Those keep changing on every autosave regardless of publish
 * state; this type only exists for rows where a snapshot has been taken.
 */
export interface PublishedPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  bodyMarkdown: string;
  tags: string[];
  coverImagePath: string | null;
  publishedAt: string;
  /** Equal to publishedAt on a first publish; later than it after any republish. */
  updatedAt: string;
}

function toPublishedPost(row: DraftRow): PublishedPost | null {
  if (
    row.slug === null ||
    row.published_at === null ||
    row.published_title === null ||
    row.published_description === null ||
    row.published_body_markdown === null ||
    row.published_updated_at === null
  ) {
    return null;
  }

  let tags: string[];
  try {
    tags = row.published_tags ? (JSON.parse(row.published_tags) as string[]) : [];
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.published_title,
    description: row.published_description,
    bodyMarkdown: row.published_body_markdown,
    tags,
    coverImagePath: row.published_cover_image_path,
    publishedAt: row.published_at,
    updatedAt: row.published_updated_at,
  };
}

/** Public post lookup by slug — only ever returns a row that is actually published. */
export async function getPublishedPostBySlug(db: D1Database, slug: string): Promise<PublishedPost | null> {
  const row = await db
    .prepare("SELECT * FROM drafts WHERE slug = ?1 AND status = 'published'")
    .bind(slug)
    .first<DraftRow>();

  return row ? toPublishedPost(row) : null;
}

export async function listPublishedPosts(db: D1Database): Promise<PublishedPost[]> {
  const { results } = await db
    .prepare("SELECT * FROM drafts WHERE status = 'published' ORDER BY published_at DESC")
    .all<DraftRow>();

  return results.reduce<PublishedPost[]>((posts, row) => {
    const post = toPublishedPost(row);
    if (post) posts.push(post);
    return posts;
  }, []);
}
