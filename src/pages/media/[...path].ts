import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Deliberately public (not under /admin or /api/admin — src/middleware.ts
// doesn't gate this) since published posts' images must be viewable by
// every reader, not just the writer.
export const GET: APIRoute = async ({ params }) => {
  const path = params.path;
  if (!path) return new Response('Not found', { status: 404 });

  const object = await env.MEDIA.get(path);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
};
