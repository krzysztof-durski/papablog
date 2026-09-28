import { z } from 'astro/zod';

/**
 * Deliberately lenient compared to `frontmatterSchema` (src/lib/schemas/frontmatter.ts):
 * a draft can be empty or half-written while the writer is still typing.
 * The strict, publish-time validation happens separately when a draft is
 * turned into a real post.
 */
export const draftInputSchema = z.object({
  title: z.string().max(200).default(''),
  description: z.string().max(300).default(''),
  bodyMarkdown: z.string().max(100_000).default(''),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  // Nullable (not just optional): omitting the field means "leave
  // unchanged" (see updateDraft's `!== undefined` guard), while an
  // explicit `null` is how the client clears a previously-set cover image.
  coverImagePath: z.url().nullable().optional(),
});

export type DraftInput = z.infer<typeof draftInputSchema>;
