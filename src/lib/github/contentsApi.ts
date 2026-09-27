export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface CommitFileOptions {
  path: string;
  content: string;
  message: string;
  /** Required when overwriting an existing file — omit only when creating a brand-new path. */
  sha?: string;
}

export interface CommitFileResult {
  sha: string;
  commitSha: string;
  htmlUrl: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${message} (HTTP ${String(status)}): ${body}`);
    this.name = 'GitHubApiError';
  }
}

const GITHUB_API_BASE = 'https://api.github.com';

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'papablog-publish-pipeline',
  };
}

function contentsUrl(config: GitHubConfig, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
}

async function readBodyForError(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** UTF-8-safe base64 encoding — plain btoa() mishandles any non-Latin1 character in post content. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// fetch()'s .json() is typed `any`, so casting it is a no-op as far as type
// *safety* goes — these validate the actual shape of GitHub's response
// rather than trusting it, same principle as validating any other
// untrusted external input. Each guard takes `unknown` (not a pre-narrowed
// cast) so `typeof x === 'object'` still does real work — note that
// `typeof null === 'object'` in JS, so the null check alongside it is load
// bearing, not redundant, despite what a cast-narrowed type might imply.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isShaObject(value: unknown): value is { sha: string } {
  return isObject(value) && typeof value.sha === 'string';
}

function isShaAndUrlObject(value: unknown): value is { sha: string; html_url: string } {
  return isObject(value) && typeof value.sha === 'string' && typeof value.html_url === 'string';
}

function isFileMetadata(value: unknown): value is { sha: string } {
  return isShaObject(value);
}

function isCommitResponse(
  value: unknown,
): value is { content: { sha: string; html_url: string }; commit: { sha: string } } {
  return isObject(value) && isShaAndUrlObject(value.content) && isShaObject(value.commit);
}

/**
 * Returns the current blob sha for a path (needed to update an existing
 * file), or null if no file exists there yet. Callers should call this
 * immediately before commitFile — never trust a cached sha from D1 — so a
 * concurrent edit elsewhere in the repo doesn't get silently clobbered.
 */
export async function getFileSha(config: GitHubConfig, path: string): Promise<string | null> {
  const res = await fetch(contentsUrl(config, path), { headers: authHeaders(config.token) });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new GitHubApiError(`Failed to read file metadata for "${path}"`, res.status, await readBodyForError(res));
  }

  const data: unknown = await res.json();
  if (!isFileMetadata(data)) {
    throw new GitHubApiError(`Unexpected response shape reading file metadata for "${path}"`, res.status, '');
  }
  return data.sha;
}

/** Creates or updates a single file via a single commit. */
export async function commitFile(config: GitHubConfig, options: CommitFileOptions): Promise<CommitFileResult> {
  const res = await fetch(contentsUrl(config, options.path), {
    method: 'PUT',
    headers: { ...authHeaders(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: options.message,
      content: toBase64(options.content),
      ...(options.sha ? { sha: options.sha } : {}),
    }),
  });

  if (!res.ok) {
    throw new GitHubApiError(`Failed to commit "${options.path}"`, res.status, await readBodyForError(res));
  }

  const data: unknown = await res.json();
  if (!isCommitResponse(data)) {
    throw new GitHubApiError(`Unexpected response shape committing "${options.path}"`, res.status, '');
  }

  return { sha: data.content.sha, commitSha: data.commit.sha, htmlUrl: data.content.html_url };
}
