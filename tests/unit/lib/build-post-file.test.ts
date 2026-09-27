import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildPostFileContent } from '../../../src/lib/content/buildPostFile';
import { frontmatterSchema } from '../../../src/lib/schemas/frontmatter';

function parseFrontmatter(fileContent: string): { data: unknown; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(fileContent);
  if (!match) throw new Error('File did not match the expected frontmatter format');
  return { data: loadYaml(match[1] ?? ''), body: match[2] ?? '' };
}

const baseFrontmatter = frontmatterSchema.parse({
  title: 'Hello, PapaBlog',
  description: 'A test post.',
  publishDate: '2026-01-15',
  tags: ['astro', 'cloudflare'],
  draft: false,
});

describe('buildPostFileContent', () => {
  it('produces valid, round-trippable YAML frontmatter', () => {
    const file = buildPostFileContent(baseFrontmatter, '# Hello\n\nBody text.');
    const { data, body } = parseFrontmatter(file);

    expect(data).toMatchObject({
      title: 'Hello, PapaBlog',
      description: 'A test post.',
      tags: ['astro', 'cloudflare'],
      draft: false,
    });
    expect((data as { publishDate: string }).publishDate).toContain('2026-01-15');
    expect(body.trim()).toBe('# Hello\n\nBody text.');
  });

  it.each([
    'A title: with a colon',
    'A "quoted" title',
    'A title with a backslash \\',
    'Title — with an em dash and emoji 🎉',
    'Title\nwith a newline-like character sequence',
  ])('round-trips special characters in the title safely: %s', (title) => {
    const frontmatter = frontmatterSchema.parse({ ...baseFrontmatter, title: title.replace(/\n/g, ' ') });

    const file = buildPostFileContent(frontmatter, 'Body.');
    const { data } = parseFrontmatter(file);

    expect((data as { title: string }).title).toBe(frontmatter.title);
  });

  it('omits optional fields entirely when not set, rather than writing them as null/undefined', () => {
    const file = buildPostFileContent(baseFrontmatter, 'Body.');

    expect(file).not.toContain('coverImage');
    expect(file).not.toContain('updatedDate');
  });

  it('includes optional fields when present', () => {
    const frontmatter = frontmatterSchema.parse({
      ...baseFrontmatter,
      updatedDate: '2026-02-01',
      coverImage: 'https://papablog.durski.dev/media/posts/abc/cover.webp',
      coverImageAlt: 'A screenshot',
    });

    const file = buildPostFileContent(frontmatter, 'Body.');
    const { data } = parseFrontmatter(file);

    expect(data).toMatchObject({
      coverImage: 'https://papablog.durski.dev/media/posts/abc/cover.webp',
      coverImageAlt: 'A screenshot',
    });
  });

  it('trims the body and ends the file with a single trailing newline', () => {
    const file = buildPostFileContent(baseFrontmatter, '\n\n  Body with padding.  \n\n');

    expect(file.endsWith('Body with padding.\n')).toBe(true);
  });
});
