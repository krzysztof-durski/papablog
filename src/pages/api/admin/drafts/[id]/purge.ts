import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../../../lib/auth/context';
import { recordAuditLog } from '../../../../../lib/db/auditLog';
import { purgeDraft } from '../../../../../lib/db/drafts';

export const prerender = false;

/** Permanently deletes a draft's row — only ever reachable for a draft already sitting in trash. */
export const POST: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) return new Response('Not found', { status: 404 });

  const actorEmail = getAccessEmail(locals);
  const purged = await purgeDraft(env.DB, id);
  if (!purged) {
    return new Response('Not found, or not trashed (only trashed drafts can be purged)', { status: 404 });
  }

  await recordAuditLog(env.DB, { actorEmail, action: 'draft.purge', targetType: 'draft', targetId: id });

  return new Response(null, { status: 204 });
};
