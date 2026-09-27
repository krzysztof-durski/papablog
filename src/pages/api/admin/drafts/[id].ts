import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'astro/zod';
import { getAccessEmail } from '../../../../lib/auth/context';
import { deleteDraft, getDraft, updateDraft } from '../../../../lib/db/drafts';
import { draftInputSchema } from '../../../../lib/schemas/draft';

export const prerender = false;

const draftPatchSchema = draftInputSchema.partial();

// [id].ts guarantees params.id is present for every matched request; this
// avoids a non-null assertion at each of the three call sites below.
function requireId(params: Partial<Record<string, string>>): string {
  const id = params.id;
  if (!id) throw new Error('Route matched without an id param');
  return id;
}

export const GET: APIRoute = async ({ params }) => {
  const draft = await getDraft(env.DB, requireId(params));
  if (!draft) return new Response('Not found', { status: 404 });
  return Response.json({ draft });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const id = requireId(params);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsed = draftPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const draft = await updateDraft(env.DB, id, parsed.data, getAccessEmail(locals));
  if (!draft) return new Response('Not found', { status: 404 });

  return Response.json({ draft });
};

export const DELETE: APIRoute = async ({ params }) => {
  const deleted = await deleteDraft(env.DB, requireId(params));
  if (!deleted) {
    return new Response('Not found, or already published (published drafts cannot be deleted)', { status: 404 });
  }
  return new Response(null, { status: 204 });
};
