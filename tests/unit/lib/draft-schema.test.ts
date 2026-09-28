import { describe, expect, it } from 'vitest';
import { draftInputSchema } from '../../../src/lib/schemas/draft';

describe('draftInputSchema', () => {
  it('applies defaults for an entirely empty input', () => {
    const result = draftInputSchema.parse({});

    expect(result.title).toBe('');
    expect(result.tags).toEqual([]);
    expect(result.coverImagePath).toBeUndefined();
  });

  it('accepts a valid cover image URL', () => {
    const result = draftInputSchema.parse({ coverImagePath: 'https://media.example.com/cover.webp' });
    expect(result.coverImagePath).toBe('https://media.example.com/cover.webp');
  });

  it('accepts an explicit null cover image path (clearing it)', () => {
    const result = draftInputSchema.parse({ coverImagePath: null });
    expect(result.coverImagePath).toBeNull();
  });

  it('rejects a non-URL cover image path', () => {
    expect(() => draftInputSchema.parse({ coverImagePath: 'not-a-url' })).toThrow();
  });
});
