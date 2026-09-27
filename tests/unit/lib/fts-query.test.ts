import { describe, expect, it } from 'vitest';
import { toFtsMatchQuery } from '../../../src/lib/security/ftsQuery';

describe('toFtsMatchQuery', () => {
  it('wraps a single word as a quoted phrase', () => {
    expect(toFtsMatchQuery('astro')).toBe('"astro"');
  });

  it('ANDs multiple words together, each individually quoted', () => {
    expect(toFtsMatchQuery('cloudflare workers')).toBe('"cloudflare" AND "workers"');
  });

  it('collapses repeated whitespace', () => {
    expect(toFtsMatchQuery('  astro    d1  ')).toBe('"astro" AND "d1"');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(toFtsMatchQuery('')).toBeNull();
    expect(toFtsMatchQuery('   ')).toBeNull();
  });

  it('caps the number of terms', () => {
    const manyWords = Array.from({ length: 20 }, (_, i) => `term${String(i)}`).join(' ');
    const result = toFtsMatchQuery(manyWords, 10);
    expect(result?.split(' AND ')).toHaveLength(10);
  });

  it.each([
    ['double-quote embedded in a term', 'foo"bar', '"foo""bar"'],
    ['boolean operator as literal text', 'OR', '"OR"'],
    ['NEAR operator as literal text', 'NEAR', '"NEAR"'],
    ['column-filter colon as literal text', 'title:x', '"title:x"'],
    ['prefix-match star as literal text', 'astro*', '"astro*"'],
    ['unbalanced quote as literal text', '"unterminated', '"""unterminated"'],
    ['leading minus as literal text', '-astro', '"-astro"'],
  ])('treats %s as literal text, not an FTS5 operator', (_label, input, expected) => {
    expect(toFtsMatchQuery(input)).toBe(expected);
  });
});
