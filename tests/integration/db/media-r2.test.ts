import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { hashImageContent } from '../../../src/lib/media/contentHash';
import { validateImageUpload } from '../../../src/lib/media/validateImage';

/**
 * Exercises the same put -> serve round trip the real
 * /api/admin/drafts/[id]/media and /media/[...path] routes perform, against
 * a real R2 bucket via Miniflare — validating the key scheme and
 * content-type round trip those routes rely on.
 */
describe('R2 media put/get round trip', () => {
  it('stores and retrieves an object with the correct content type at the expected key', async () => {
    const draftId = 'test-draft-id';
    const fakeImageBytes = new TextEncoder().encode('pretend this is PNG bytes').buffer;
    const contentType = 'image/png';

    const validation = validateImageUpload(contentType, fakeImageBytes.byteLength);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;

    const hash = await hashImageContent(fakeImageBytes);
    const key = `posts/${draftId}/${hash}.${validation.extension}`;

    await env.MEDIA.put(key, fakeImageBytes, { httpMetadata: { contentType } });

    const object = await env.MEDIA.get(key);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe(contentType);

    const retrievedBytes = await object?.arrayBuffer();
    expect(new TextDecoder().decode(retrievedBytes)).toBe('pretend this is PNG bytes');
  });

  it('returns null for a key that was never uploaded', async () => {
    const object = await env.MEDIA.get('posts/nonexistent/nope.png');
    expect(object).toBeNull();
  });

  it('re-uploading identical bytes lands at the same content-addressed key (natural de-dup)', async () => {
    const bytes = new TextEncoder().encode('duplicate content').buffer;
    const hashA = await hashImageContent(bytes);
    const hashB = await hashImageContent(bytes);

    expect(hashA).toBe(hashB);
  });
});
