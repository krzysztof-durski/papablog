import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../../lib/auth/context';
import { createDraft, listDrafts } from '../../../../lib/db/drafts';

export const prerender = false;

export const GET: APIRoute = async () => {
  const drafts = await listDrafts(env.DB);
  return Response.json({ drafts });
};

export const POST: APIRoute = async ({ locals }) => {
  const draft = await createDraft(env.DB, getAccessEmail(locals));
  return Response.json({ draft }, { status: 201 });
};
