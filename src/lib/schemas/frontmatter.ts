import { z } from 'astro/zod';

/**
 * Single source of truth for a published post's frontmatter shape.
 *
 * Reused in two places that must never drift apart:
 *  - `src/content.config.ts` (Astro Content Collections validates every
 *    markdown file in src/content/posts against this at build time)
 *  - the future `/api/admin/publish` route (validates a draft with this
 *    exact schema before it's ever committed as a markdown file)
 */
export const frontmatterSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(300),
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string().min(1).max(40)).default([]),
  // Cover images are uploaded to R2 by the admin editor and referenced by
  // their public R2 URL — not a local file, so this is a validated URL
  // string rather than Astro's `image()` helper (build-time local assets).
  coverImage: z.url().optional(),
  coverImageAlt: z.string().max(200).optional(),
  draft: z.boolean().default(false),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;
