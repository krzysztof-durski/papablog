import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDraft } from '../../../../../lib/db/drafts';
import { hashImageContent } from '../../../../../lib/media/contentHash';
import { validateImageUpload } from '../../../../../lib/media/validateImage';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url }) => {
  const draftId = params.id;
  if (!draftId) throw new Error('Route matched without an id param');

  const draft = await getDraft(env.DB, draftId);
  if (!draft) return new Response('Draft not found', { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing "file" field.' }, { status: 400 });
  }

  const validation = validateImageUpload(file.type, file.size);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const hash = await hashImageContent(buffer);
  const key = `posts/${draftId}/${hash}.${validation.extension}`;

  await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: file.type } });

  // Draft/frontmatter schemas validate coverImagePath as a full URL
  // (z.url()) — a bare "/media/..." path fails that check, so this builds
  // an absolute URL against the request's own origin (works the same
  // locally and in production without hardcoding the domain).
  const absoluteUrl = new URL(`/media/${key}`, url.origin).toString();

  return Response.json({ url: absoluteUrl }, { status: 201 });
};
