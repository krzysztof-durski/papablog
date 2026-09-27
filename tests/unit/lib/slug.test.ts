import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../../../src/lib/slug';

describe('slugify', () => {
  it('lowercases and hyphenates a normal title', () => {
    expect(slugify('Hello, PapaBlog!')).toBe('hello-papablog');
  });

  it('strips diacritics', () => {
    expect(slugify('Café résumé')).toBe('cafe-resume');
  });

  it('collapses runs of punctuation/whitespace into a single hyphen', () => {
    expect(slugify('Astro  +  Cloudflare -- 2026')).toBe('astro-cloudflare-2026');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--already hyphenated--')).toBe('already-hyphenated');
  });

  it('produces a path-traversal-safe slug even from hostile input', () => {
    const slug = slugify('../../etc/passwd');
    expect(slug).not.toContain('..');
    expect(slug).not.toContain('/');
    expect(isValidSlug(slug)).toBe(true);
  });

  it('truncates very long titles to a bounded length', () => {
    const slug = slugify('a'.repeat(500));
    expect(slug.length).toBeLessThanOrEqual(100);
  });

  it('never leaves a trailing hyphen after truncation', () => {
    // Chosen so the 100-char cutoff lands mid-word, then a hyphen right after.
    const title = 'word-'.repeat(30);
    const slug = slugify(title);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it.each(['hello-world', 'astro', 'cloudflare-2026', 'a', 'a-b-c-d-e'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['uppercase letters', 'Hello-World'],
    ['leading hyphen', '-hello'],
    ['trailing hyphen', 'hello-'],
    ['double hyphen', 'hello--world'],
    ['path traversal', '../etc/passwd'],
    ['forward slash', 'a/b'],
    ['dot segment', '.'],
    ['space', 'hello world'],
    ['underscore', 'hello_world'],
    ['over max length', 'a'.repeat(101)],
  ])('rejects %s', (_label, input) => {
    expect(isValidSlug(input)).toBe(false);
  });
});
