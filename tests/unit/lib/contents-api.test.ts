import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitFile, GitHubApiError, getFileSha } from '../../../src/lib/github/contentsApi';

const config = { owner: 'dursky', repo: 'papablog', token: 'test-token' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getFileSha', () => {
  it('returns the sha when the file exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sha: 'abc123' }));

    const sha = await getFileSha(config, 'src/content/posts/hello.md');

    expect(sha).toBe('abc123');
  });

  it('returns null when the file does not exist (404)', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const sha = await getFileSha(config, 'src/content/posts/nonexistent.md');

    expect(sha).toBeNull();
  });

  it('throws GitHubApiError for any other failure status', async () => {
    fetchMock.mockResolvedValue(new Response('Bad credentials', { status: 401 }));

    await expect(getFileSha(config, 'src/content/posts/hello.md')).rejects.toThrow(GitHubApiError);
  });

  it('sends the bearer token and github API headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sha: 'abc123' }));

    await getFileSha(config, 'src/content/posts/hello.md');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers.Accept).toBe('application/vnd.github+json');
  });

  it('URL-encodes each path segment', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sha: 'abc123' }));

    await getFileSha(config, 'src/content/posts/a post with spaces.md');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('a%20post%20with%20spaces.md');
  });
});

describe('commitFile', () => {
  it('creates a new file without a sha in the request body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        content: { sha: 'new-sha', html_url: 'https://github.com/x' },
        commit: { sha: 'commit-sha' },
      }),
    );

    const result = await commitFile(config, {
      path: 'src/content/posts/new-post.md',
      content: '# Hello',
      message: 'feat(post): publish "Hello"',
    });

    expect(result).toEqual({ sha: 'new-sha', commitSha: 'commit-sha', htmlUrl: 'https://github.com/x' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sha).toBeUndefined();
    expect(init.method).toBe('PUT');
  });

  it('includes the sha when updating an existing file', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { content: { sha: 'updated-sha', html_url: 'https://github.com/x' }, commit: { sha: 'c2' } }),
    );

    await commitFile(config, {
      path: 'src/content/posts/existing-post.md',
      content: '# Updated',
      message: 'feat(post): update "Hello"',
      sha: 'previous-sha',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sha).toBe('previous-sha');
  });

  it('base64-encodes UTF-8 content correctly, including non-Latin1 characters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { content: { sha: 's', html_url: 'https://github.com/x' }, commit: { sha: 'c' } }),
    );
    const original = '# Café ☕ post with émojis 🎉';

    await commitFile(config, { path: 'p.md', content: original, message: 'msg' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { content: string };
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
    expect(decoded).toBe(original);
  });

  it('throws GitHubApiError on failure (e.g. stale sha conflict)', async () => {
    fetchMock.mockResolvedValue(new Response('sha does not match', { status: 409 }));

    await expect(commitFile(config, { path: 'p.md', content: 'x', message: 'm', sha: 'stale' })).rejects.toThrow(
      GitHubApiError,
    );
  });
});
