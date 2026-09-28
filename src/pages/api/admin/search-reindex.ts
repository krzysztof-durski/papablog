import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../lib/auth/context';
import { recordAuditLog } from '../../../lib/db/auditLog';
import { listPublishedPosts } from '../../../lib/db/posts';
import { reindexAllPosts } from '../../../lib/db/postsFts';

export const prerender = false;

// A manual drift-recovery safety valve for if the incremental upsert in
// /api/admin/publish ever fails silently or posts_fts otherwise falls out
// of sync with the drafts table (the actual source of truth).
export const POST: APIRoute = async ({ locals }) => {
  const actorEmail = getAccessEmail(locals);

  const posts = await listPublishedPosts(env.DB);

  await reindexAllPosts(
    env.DB,
    posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      body: post.bodyMarkdown,
      tags: post.tags,
      publishedAt: post.publishedAt,
    })),
  );

  await recordAuditLog(env.DB, { actorEmail, action: 'search.reindex', targetType: 'search_index' });

  return Response.json({ reindexed: posts.length });
};
