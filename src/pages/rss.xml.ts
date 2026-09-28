import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { listPublishedPosts } from '../lib/db/posts';

export const prerender = false;

export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error('astro.config.mjs "site" must be set to generate the RSS feed.');
  }

  const posts = await listPublishedPosts(env.DB);

  return rss({
    title: 'PapaBlog',
    description:
      "A personal tech blog — notes on what I'm learning, written down so I remember and so others might find them useful.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: new Date(post.publishedAt),
      link: `/posts/${post.slug}/`,
      categories: post.tags,
    })),
  });
}
