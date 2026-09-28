import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { listPublishedPosts } from '../lib/db/posts';

export const prerender = false;

// Replaces @astrojs/sitemap: that integration only discovers routes Astro
// can see at build time (static pages + getStaticPaths output). Post and
// tag pages are now fully dynamic SSR routes reading D1 per-request — the
// integration would silently drop them from the sitemap, so this hand-rolls
// the equivalent from the same D1 source of truth those pages use.
const STATIC_PATHS = ['/', '/tags/', '/search/', '/about/', '/legal/privacy/', '/legal/terms/'];

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error('astro.config.mjs "site" must be set to generate the sitemap.');
  }

  const posts = await listPublishedPosts(env.DB);
  const tags = new Set(posts.flatMap((post) => post.tags));

  const urls = [
    ...STATIC_PATHS,
    ...posts.map((post) => `/posts/${post.slug}/`),
    ...Array.from(tags, (tag) => `/tags/${encodeURIComponent(tag)}/`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${xmlEscape(new URL(path, context.site).toString())}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
