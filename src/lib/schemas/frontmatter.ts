import { z } from 'astro/zod';

/**
 * Validated shape a draft must satisfy before /api/admin/publish will turn
 * it into a published post (see src/lib/db/posts.ts — D1 is the source of
 * truth for published content, not a build-time content collection).
 */
export const frontmatterSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(300),
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string().min(1).max(40)).default([]),
  // Cover images are uploaded to R2 by the admin editor and referenced by
  // their public R2 URL.
  coverImage: z.url().optional(),
  draft: z.boolean().default(false),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;
