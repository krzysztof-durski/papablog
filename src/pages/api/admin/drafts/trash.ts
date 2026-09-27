import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../../lib/auth/context';
import { recordAuditLog } from '../../../../lib/db/auditLog';
import { purgeAllTrashedDrafts } from '../../../../lib/db/drafts';

export const prerender = false;

/** Empties the trash in one go — permanently removes every currently-trashed draft. */
export const DELETE: APIRoute = async ({ locals }) => {
  const actorEmail = getAccessEmail(locals);

  const count = await purgeAllTrashedDrafts(env.DB);

  await recordAuditLog(env.DB, {
    actorEmail,
    action: 'draft.purgeAll',
    targetType: 'draft',
    metadata: { count },
  });

  return Response.json({ count });
};
