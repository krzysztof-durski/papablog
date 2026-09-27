import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCollection } from 'astro:content';
import { getAccessEmail } from '../../../lib/auth/context';
import { recordAuditLog } from '../../../lib/db/auditLog';
import { reindexAllPosts } from '../../../lib/db/postsFts';

export const prerender = false;

// Full rebuild from git (the actual source of truth) — a manual drift-
// recovery safety valve for if the incremental upsert in /api/admin/publish
// ever fails silently or the repo is edited directly, bypassing the admin.
export const POST: APIRoute = async ({ locals }) => {
  const actorEmail = getAccessEmail(locals);

  const posts = await getCollection('posts', ({ data }) => !data.draft);

  await reindexAllPosts(
    env.DB,
    posts.map((post) => ({
      slug: post.id,
      title: post.data.title,
      body: post.body ?? '',
      tags: post.data.tags,
      publishedAt: post.data.publishDate.toISOString(),
    })),
  );

  await recordAuditLog(env.DB, { actorEmail, action: 'search.reindex', targetType: 'search_index' });

  return Response.json({ reindexed: posts.length });
};
