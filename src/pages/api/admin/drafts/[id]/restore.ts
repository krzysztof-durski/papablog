import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../../../lib/auth/context';
import { recordAuditLog } from '../../../../../lib/db/auditLog';
import { restoreDraft } from '../../../../../lib/db/drafts';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) return new Response('Not found', { status: 404 });

  const actorEmail = getAccessEmail(locals);
  const restored = await restoreDraft(env.DB, id, actorEmail);
  if (!restored) {
    return new Response('Not found, or not trashed', { status: 404 });
  }

  await recordAuditLog(env.DB, { actorEmail, action: 'draft.restore', targetType: 'draft', targetId: id });

  return Response.json({ draft: restored });
};
