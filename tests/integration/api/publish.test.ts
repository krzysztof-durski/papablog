import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as publishHandler } from '../../../src/pages/api/admin/publish';
import { POST as unpublishHandler } from '../../../src/pages/api/admin/unpublish';
import { createDraft, getDraft, updateDraft } from '../../../src/lib/db/drafts';
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

type FetchMock = ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>;
let fetchMock: FetchMock;

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM drafts').run();
  await env.DB.prepare('DELETE FROM audit_log').run();
  await env.DB.prepare('DELETE FROM posts_fts').run();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

function mockGithubSuccess() {
  fetchMock.mockImplementation((_input, init) => {
    if (!init || init.method === undefined) {
      // getFileSha (GET) — pretend the file doesn't exist yet.
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: { sha: 'new-blob-sha', html_url: 'https://github.com/dursky/papablog/blob/main/x.md' },
          commit: { sha: 'commit-sha-1' },
        }),
        { status: 201 },
      ),
    );
  });
}

describe('POST /api/admin/publish', () => {
  it('publishes a complete draft: commits to GitHub, marks it published, indexes it, and audit-logs it', async () => {
    mockGithubSuccess();
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
    expect(published?.githubPath).toBe('src/content/posts/my-first-post.md');
    expect(published?.publishedAt).toBeTruthy();

    const searchResults = await searchPosts(env.DB, 'Hello');
    expect(searchResults.map((r) => r.slug)).toContain('my-first-post');

    const auditEntries = await listAuditLog(env.DB);
    expect(auditEntries[0]).toMatchObject({ action: 'post.publish', targetType: 'post', targetId: 'my-first-post' });
  });

  it('rejects an incomplete draft (empty body) without ever calling GitHub', async () => {
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(env.DB, draft.id, { title: 'Title only', description: 'Some description here.' }, WRITER);

    const res = await publishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
    const stillDraft = await getDraft(env.DB, draft.id);
    expect(stillDraft?.status).toBe('draft');
  });

  it('returns 404 for a nonexistent draft', async () => {
    const res = await publishHandler(makeContext({ draftId: crypto.randomUUID() }));
    expect(res.status).toBe(404);
  });

  it('leaves D1 and the audit log untouched when the GitHub commit fails', async () => {
    fetchMock.mockImplementation((_input, init) => {
      if (!init || init.method === undefined) return Promise.resolve(new Response('Not Found', { status: 404 }));
      return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
    });
    const draft = await createDraft(env.DB, WRITER);
    await updateDraft(
      env.DB,
      draft.id,
      { title: 'Will Fail', description: 'A description long enough.', bodyMarkdown: 'Body.' },
      WRITER,
    );

    const res = await publishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(502);
    const stillDraft = await getDraft(env.DB, draft.id);
    expect(stillDraft?.status).toBe('draft');
    expect(stillDraft?.slug).toBeNull();
    expect(await listAuditLog(env.DB)).toHaveLength(0);
    expect(await searchPosts(env.DB, 'Fail')).toHaveLength(0);
  });

  it('reuses the existing slug and github path on a republish rather than deriving a new one', async () => {
    mockGithubSuccess();
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
    expect(republished?.githubPath).toBe('src/content/posts/original-title.md');
  });
});

describe('POST /api/admin/unpublish', () => {
  it('withdraws a published post: commits draft:true, removes it from search, archives the row', async () => {
    mockGithubSuccess();
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
  });

  it('refuses to unpublish a draft that was never published', async () => {
    const draft = await createDraft(env.DB, WRITER);

    const res = await unpublishHandler(makeContext({ draftId: draft.id }));

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
