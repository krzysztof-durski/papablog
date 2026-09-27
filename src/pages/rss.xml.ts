import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export const prerender = true;

export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error('astro.config.mjs "site" must be set to generate the RSS feed.');
  }

  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const sorted = posts.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: 'PapaBlog',
    description:
      "A personal tech blog — notes on what I'm learning, written down so I remember and so others might find them useful.",
    site: context.site,
    items: sorted.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
    })),
  });
}
