import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as publishHandler } from '../../../src/pages/api/admin/publish';
import { POST as unpublishHandler } from '../../../src/pages/api/admin/unpublish';
import { createDraft, getDraft, updateDraft } from '../../../src/lib/db/drafts';
import { getPublishedPostBySlug } from '../../../src/lib/db/posts';
import { listAuditLog } from '../../../src/lib/db/auditLog';
import { searchPosts } from '../../../src/lib/db/postsFts';

const WRITER = 'dursky.k@gmail.com';

// Minimal stand-in for Astro's APIContext — these handlers only ever
// destructure `request` and `locals`, so that's all a test needs to supply.
// Routed through `unknown` (not `any`) so the cast doesn't silently defeat
// type-checking anywhere the result is used.
function makeContext(body: unknown): APIContext {
  const context = {
    request: new Request('http://localhost/api/admin/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { accessEmail: WRITER },
  };
  return context as unknown as APIContext;
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM drafts').run();
  await env.DB.prepare('DELETE FROM audit_log').run();
  await env.DB.prepare('DELETE FROM posts_fts').run();
});

describe('POST /api/admin/publish', () => {
  it('publishes a complete draft: snapshots it as live, indexes it, and audit-logs it', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      {
        title: 'My First Post',
        description: 'A description long enough.',
        bodyMarkdown: '# Hello\n\nBody.',
        tags: ['astro'],
      },
      WRITER,
    );

    const res = await publishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(200);
    const published = await getDraft(env.DB, draft.id);
    expect(published?.status).toBe('published');
    expect(published?.slug).toBe('my-first-post');
    expect(published?.publishedAt).toBeTruthy();
    expect(published?.publishedUpdatedAt).toBe(published?.publishedAt);

    const post = await getPublishedPostBySlug(env.DB, 'my-first-post');
    expect(post?.title).toBe('My First Post');
    expect(post?.bodyMarkdown).toBe('# Hello\n\nBody.');

    const searchResults = await searchPosts(env.DB, 'Hello');
    expect(searchResults.map((r) => r.slug)).toContain('my-first-post');

    const auditEntries = await listAuditLog(env.DB);
    expect(auditEntries[0]).toMatchObject({ action: 'post.publish', targetType: 'post', targetId: 'my-first-post' });
  });

  it('rejects an incomplete draft (empty body)', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(env.DB, draft.id, { title: 'Title only', description: 'Some description here.' }, WRITER);

    const res = await publishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(422);
    const stillDraft = await getDraft(env.DB, draft.id);
    expect(stillDraft?.status).toBe('draft');
  });

  it('returns 404 for a nonexistent draft', async () => {
    const res = await publishHandler(makeContext({ draftId: crypto.randomUUID() }));
    expect(res.status).toBe(404);
  });

  it('reuses the existing slug on a republish rather than deriving a new one', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'Original Title', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await publishHandler(makeContext({ draftId: draft.id }));

    // Edit the title after publishing, then publish again.
    await updateDraft(env.DB, draft.id, { title: 'Changed Title' }, WRITER);
    const res = await publishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(200);
    const republished = await getDraft(env.DB, draft.id);
    expect(republished?.slug).toBe('original-title');
  });

  it('does not publish edits made after the last Publish click until Publish is clicked again', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'Two Phase', description: 'A description long enough.', bodyMarkdown: 'Original body.' },
      WRITER,
    );
    await publishHandler(makeContext({ draftId: draft.id }));

    // Edit the body without re-publishing — the live post must be unaffected.
    await updateDraft(env.DB, draft.id, { bodyMarkdown: 'Edited but not yet published.' }, WRITER);

    const liveBefore = await getPublishedPostBySlug(env.DB, 'two-phase');
    expect(liveBefore?.bodyMarkdown).toBe('Original body.');

    await publishHandler(makeContext({ draftId: draft.id }));

    const liveAfter = await getPublishedPostBySlug(env.DB, 'two-phase');
    expect(liveAfter?.bodyMarkdown).toBe('Edited but not yet published.');
    expect(liveAfter?.updatedAt).not.toBe(liveAfter?.publishedAt);
  });
});

describe('POST /api/admin/unpublish', () => {
  it('withdraws a published post: removes it from search, archives the row', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'To Withdraw', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );
    await publishHandler(makeContext({ draftId: draft.id }));
    expect(await searchPosts(env.DB, 'Withdraw')).toHaveLength(1);

    const res = await unpublishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(200);
    const archived = await getDraft(env.DB, draft.id);
    expect(archived?.status).toBe('archived');
    expect(archived?.slug).toBe('to-withdraw'); // preserved as history
    expect(await searchPosts(env.DB, 'Withdraw')).toHaveLength(0);
    expect(await getPublishedPostBySlug(env.DB, 'to-withdraw')).toBeNull();
  });

  it('refuses to unpublish a draft that was never published', async () => {
    const draft = await createDraft(env.DB, WRITER);

    const res = await unpublishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(409);
  });
});
