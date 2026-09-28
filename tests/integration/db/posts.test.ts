import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDraft, markDraftPublished, markDraftUnpublished, updateDraft } from '../../../src/lib/db/drafts';
import { getPublishedPostBySlug, listPublishedPosts } from '../../../src/lib/db/posts';

const WRITER = 'dursky.k@gmail.com';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM drafts').run();
});

describe('getPublishedPostBySlug', () => {
  it('returns null for a slug with no published post', async () => {
    expect(await getPublishedPostBySlug(env.DB, 'nope')).toBeNull();
  });

  it('returns null for a never-published draft even if it somehow has a slug', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await env.DB.prepare('UPDATE drafts SET slug = ?1 WHERE id = ?2').bind('sneaky', draft.id).run();

    expect(await getPublishedPostBySlug(env.DB, 'sneaky')).toBeNull();
  });

  it('returns the published snapshot, not the live-editable draft fields', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'Snapshot Title', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await markDraftPublished(env.DB, draft.id, { slug: 'snapshot-title' }, WRITER);
    await updateDraft(env.DB, draft.id, { title: 'Edited After Publish' }, WRITER);

    const post = await getPublishedPostBySlug(env.DB, 'snapshot-title');

    expect(post?.title).toBe('Snapshot Title');
  });

  it('returns null once a published post has been unpublished', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'Gone Soon', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await markDraftPublished(env.DB, draft.id, { slug: 'gone-soon' }, WRITER);
    await markDraftUnpublished(env.DB, draft.id, WRITER);

    expect(await getPublishedPostBySlug(env.DB, 'gone-soon')).toBeNull();
  });
});

describe('listPublishedPosts', () => {
  it('lists only published posts, newest-published first', async () => {
    const first = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      first.id,
      { title: 'First', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await markDraftPublished(env.DB, first.id, { slug: 'first' }, WRITER);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      second.id,
      { title: 'Second', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await markDraftPublished(env.DB, second.id, { slug: 'second' }, WRITER);

    // Never published — must not appear.
    await createDraft(env.DB, WRITER);

    const posts = await listPublishedPosts(env.DB);

    expect(posts.map((p) => p.slug)).toEqual(['second', 'first']);
  });
});
