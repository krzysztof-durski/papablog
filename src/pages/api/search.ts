import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { searchQuerySchema } from '../../lib/schemas/search';
import { searchPosts } from '../../lib/db/postsFts';

export const prerender = false;

// Rate limiting for this public endpoint is applied in the security
// hardening pass (see docs/security.md once written), alongside the same
// binding on the newsletter endpoints — not added piecemeal per-route.
export const GET: APIRoute = async ({ url }) => {
  const parsed = searchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return Response.json({ results: [] });
  }

  const results = await searchPosts(env.DB, parsed.data.q);
  return Response.json({ results });
};
