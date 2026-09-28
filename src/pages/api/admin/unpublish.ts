import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../lib/auth/context';
import { recordAuditLog } from '../../../lib/db/auditLog';
import { getDraft, markDraftUnpublished } from '../../../lib/db/drafts';
import { removePostFromIndex } from '../../../lib/db/postsFts';
import { publishRequestSchema } from '../../../lib/schemas/publishRequest';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actorEmail = getAccessEmail(locals);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsedRequest = publishRequestSchema.safeParse(rawBody);
  if (!parsedRequest.success) {
    return Response.json({ error: 'draftId is required' }, { status: 400 });
  }

  const draft = await getDraft(env.DB, parsedRequest.data.draftId);
  if (!draft) return new Response('Draft not found', { status: 404 });

  const { slug } = draft;
  if (draft.status !== 'published' || !slug) {
    return Response.json({ error: 'This draft is not currently published.' }, { status: 409 });
  }

  const updated = await markDraftUnpublished(env.DB, draft.id, actorEmail);

  await removePostFromIndex(env.DB, slug);

  await recordAuditLog(env.DB, {
    actorEmail,
    action: 'post.unpublish',
    targetType: 'post',
    targetId: slug,
  });

  return Response.json({ draft: updated });
};
