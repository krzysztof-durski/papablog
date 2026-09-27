import { toFtsMatchQuery } from '../security/ftsQuery';

export interface IndexedPost {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  publishedAt: string;
}

export interface SearchResult {
  slug: string;
  title: string;
  snippet: string;
}

/**
 * Inserts or updates one post's entry in the `posts_fts` search cache.
 * FTS5 has no native UPSERT, so this deletes any existing row for the slug
 * first, then inserts — both statements run in one batch so a crash between
 * them can't leave the index in a half-updated state.
 */
export async function upsertPostInIndex(db: D1Database, post: IndexedPost): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM posts_fts WHERE slug = ?1').bind(post.slug),
    db
      .prepare('INSERT INTO posts_fts (slug, title, body, tags, published_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(post.slug, post.title, post.body, post.tags.join(' '), post.publishedAt),
  ]);
}

export async function removePostFromIndex(db: D1Database, slug: string): Promise<void> {
  await db.prepare('DELETE FROM posts_fts WHERE slug = ?1').bind(slug).run();
}

/** Full rebuild from a known-good list of posts — the drift-recovery path. */
export async function reindexAllPosts(db: D1Database, posts: IndexedPost[]): Promise<void> {
  const statements = [
    db.prepare('DELETE FROM posts_fts'),
    ...posts.map((post) =>
      db
        .prepare('INSERT INTO posts_fts (slug, title, body, tags, published_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(post.slug, post.title, post.body, post.tags.join(' '), post.publishedAt),
    ),
  ];
  await db.batch(statements);
}

export async function searchPosts(db: D1Database, rawQuery: string, limit = 20): Promise<SearchResult[]> {
  const matchQuery = toFtsMatchQuery(rawQuery);
  if (!matchQuery) return [];

  const { results } = await db
    .prepare(
      `SELECT
         slug,
         title,
         snippet(posts_fts, 2, '[', ']', '…', 24) AS snippet
       FROM posts_fts
       WHERE posts_fts MATCH ?1
       ORDER BY rank
       LIMIT ?2`,
    )
    .bind(matchQuery, limit)
    .all<SearchResult>();

  return results;
}
