import { describe, expect, it } from 'vitest';
import { hashImageContent } from '../../../src/lib/media/contentHash';

describe('hashImageContent', () => {
  it('is deterministic for identical content', async () => {
    const bytes = new TextEncoder().encode('same image bytes').buffer;

    const a = await hashImageContent(bytes);
    const b = await hashImageContent(bytes);

    expect(a).toBe(b);
  });

  it('differs for different content', async () => {
    const a = await hashImageContent(new TextEncoder().encode('image a').buffer);
    const b = await hashImageContent(new TextEncoder().encode('image b').buffer);

    expect(a).not.toBe(b);
  });

  it('produces a 16-character lowercase hex string', async () => {
    const hash = await hashImageContent(new TextEncoder().encode('x').buffer);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
