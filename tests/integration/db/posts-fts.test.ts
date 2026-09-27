import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { reindexAllPosts, removePostFromIndex, searchPosts, upsertPostInIndex } from '../../../src/lib/db/postsFts';

const astroPost = {
  slug: 'astro-content-collections',
  title: 'Astro Content Collections',
  body: 'A guide to type-safe markdown content in Astro using the glob loader.',
  tags: ['astro', 'content'],
  publishedAt: '2026-01-01T00:00:00.000Z',
};

const cloudflarePost = {
  slug: 'cloudflare-workers-intro',
  title: 'Getting started with Cloudflare Workers',
  body: 'Workers run JavaScript at the edge, close to users, with D1 for SQL storage.',
  tags: ['cloudflare', 'workers'],
  publishedAt: '2026-01-02T00:00:00.000Z',
};

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM posts_fts').run();
});

describe('upsertPostInIndex + searchPosts', () => {
  it('finds a post by a word in its title', async () => {
    await upsertPostInIndex(env.DB, astroPost);

    const results = await searchPosts(env.DB, 'Astro');

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('astro-content-collections');
  });

  it('finds a post by a word only in its body', async () => {
    await upsertPostInIndex(env.DB, cloudflarePost);

    const results = await searchPosts(env.DB, 'edge');

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('cloudflare-workers-intro');
  });

  it('requires all words in a multi-word query to match (AND)', async () => {
    await upsertPostInIndex(env.DB, astroPost);
    await upsertPostInIndex(env.DB, cloudflarePost);

    const both = await searchPosts(env.DB, 'Workers D1');
    expect(both.map((r) => r.slug)).toEqual(['cloudflare-workers-intro']);

    const neither = await searchPosts(env.DB, 'Astro D1');
    expect(neither).toHaveLength(0);
  });

  it('returns no results for a term that matches nothing', async () => {
    await upsertPostInIndex(env.DB, astroPost);

    const results = await searchPosts(env.DB, 'nonexistentword');

    expect(results).toHaveLength(0);
  });

  it('replacing a slug via upsert removes the old row (delete-then-insert)', async () => {
    await upsertPostInIndex(env.DB, astroPost);
    await upsertPostInIndex(env.DB, { ...astroPost, title: 'Updated Title', body: 'Completely different body now.' });

    const oldTitleMatch = await searchPosts(env.DB, 'Collections');
    const newTitleMatch = await searchPosts(env.DB, 'Updated');

    expect(oldTitleMatch).toHaveLength(0);
    expect(newTitleMatch).toHaveLength(1);
  });

  it.each([
    ['unbalanced quote', '"astro'],
    ['boolean operators', 'astro OR NOT AND'],
    ['NEAR operator', 'astro NEAR/2 workers'],
    ['column filter syntax', 'title:astro'],
    ['prefix wildcard', 'ast*'],
    ['just punctuation', '""" *** :::'],
  ])('does not throw on FTS5 special-character input (%s)', async (_label, maliciousQuery) => {
    await upsertPostInIndex(env.DB, astroPost);

    await expect(searchPosts(env.DB, maliciousQuery)).resolves.toBeDefined();
  });
});

describe('removePostFromIndex', () => {
  it('removes a post so it no longer appears in results', async () => {
    await upsertPostInIndex(env.DB, astroPost);
    await removePostFromIndex(env.DB, astroPost.slug);

    const results = await searchPosts(env.DB, 'Astro');

    expect(results).toHaveLength(0);
  });
});

describe('reindexAllPosts', () => {
  it('replaces the entire index contents', async () => {
    await upsertPostInIndex(env.DB, astroPost);

    await reindexAllPosts(env.DB, [cloudflarePost]);

    const oldResults = await searchPosts(env.DB, 'Astro');
    const newResults = await searchPosts(env.DB, 'Cloudflare');

    expect(oldResults).toHaveLength(0);
    expect(newResults).toHaveLength(1);
  });
});
