import { describe, expect, it } from 'vitest';
import { frontmatterSchema } from '../../../src/lib/schemas/frontmatter';

const validFrontmatter = {
  title: 'A valid post',
  description: 'A description that is long enough to be meaningful.',
  publishDate: '2026-01-01',
};

describe('frontmatterSchema', () => {
  it('accepts a minimal valid frontmatter and applies defaults', () => {
    const result = frontmatterSchema.parse(validFrontmatter);

    expect(result.title).toBe('A valid post');
    expect(result.tags).toEqual([]);
    expect(result.draft).toBe(false);
    expect(result.publishDate).toBeInstanceOf(Date);
  });

  it.each([
    ['empty title', { ...validFrontmatter, title: '' }],
    ['title over 200 chars', { ...validFrontmatter, title: 'a'.repeat(201) }],
    ['empty description', { ...validFrontmatter, description: '' }],
    ['missing publishDate', { title: validFrontmatter.title, description: validFrontmatter.description }],
    ['invalid publishDate', { ...validFrontmatter, publishDate: 'not-a-date' }],
    ['tag over 40 chars', { ...validFrontmatter, tags: ['a'.repeat(41)] }],
    ['empty-string tag', { ...validFrontmatter, tags: [''] }],
    ['non-URL coverImage', { ...validFrontmatter, coverImage: 'not-a-url' }],
    ['non-boolean draft', { ...validFrontmatter, draft: 'yes' }],
  ])('rejects %s', (_label, input) => {
    expect(() => frontmatterSchema.parse(input)).toThrow();
  });

  it('accepts a fully populated frontmatter', () => {
    const result = frontmatterSchema.parse({
      ...validFrontmatter,
      updatedDate: '2026-02-01',
      tags: ['cloudflare', 'astro'],
      coverImage: 'https://media.papablog.durski.dev/posts/example/cover.webp',
      coverImageAlt: 'A screenshot of the dashboard',
      draft: true,
    });

    expect(result.tags).toEqual(['cloudflare', 'astro']);
    expect(result.draft).toBe(true);
    expect(result.updatedDate).toBeInstanceOf(Date);
  });
});
