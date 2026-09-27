import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { frontmatterSchema } from './lib/schemas/frontmatter';

// The filename (glob loader's `id`) is the canonical slug — it is never
// duplicated into frontmatter, so the two can't drift apart. The publish
// pipeline (src/lib/slug.ts) is responsible for choosing a safe filename
// before a post is ever committed.
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: frontmatterSchema,
});

export const collections = { posts };
