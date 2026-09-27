import { z } from 'astro/zod';

export const publishRequestSchema = z.object({ draftId: z.string().min(1) });
