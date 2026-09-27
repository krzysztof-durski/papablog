import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageUpload } from '../../../src/lib/media/validateImage';

describe('validateImageUpload', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
  ])('accepts %s with extension %s', (mimeType, extension) => {
    const result = validateImageUpload(mimeType, 1024);
    expect(result).toEqual({ valid: true, extension });
  });

  it.each(['image/gif', 'image/svg+xml', 'text/html', 'application/pdf', ''])(
    'rejects unsupported type %s',
    (mimeType) => {
      const result = validateImageUpload(mimeType, 1024);
      expect(result.valid).toBe(false);
    },
  );

  it('rejects a file over the size limit', () => {
    const result = validateImageUpload('image/png', MAX_IMAGE_BYTES + 1);
    expect(result.valid).toBe(false);
  });

  it('accepts a file exactly at the size limit', () => {
    const result = validateImageUpload('image/png', MAX_IMAGE_BYTES);
    expect(result.valid).toBe(true);
  });

  it('rejects an empty (zero-byte) file', () => {
    const result = validateImageUpload('image/png', 0);
    expect(result.valid).toBe(false);
  });
});
