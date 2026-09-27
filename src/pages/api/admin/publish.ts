import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'astro/zod';
import { getAccessEmail } from '../../../lib/auth/context';
import { recordAuditLog } from '../../../lib/db/auditLog';
import { getDraft, markDraftPublished } from '../../../lib/db/drafts';
import { upsertPostInIndex } from '../../../lib/db/postsFts';
import { buildPostFileContent } from '../../../lib/content/buildPostFile';
import { commitFile, getFileSha, GitHubApiError, type GitHubConfig } from '../../../lib/github/contentsApi';
import { frontmatterSchema } from '../../../lib/schemas/frontmatter';
import { publishRequestSchema } from '../../../lib/schemas/publishRequest';
import { isValidSlug, slugify } from '../../../lib/slug';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actorEmail = getAccessEmail(locals);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsedRequest = publishRequestSchema.safeParse(rawBody);
  if (!parsedRequest.success) {
    return Response.json({ error: 'draftId is required' }, { status: 400 });
  }

  const draft = await getDraft(env.DB, parsedRequest.data.draftId);
  if (!draft) return new Response('Draft not found', { status: 404 });

  const publishDate = new Date();
  const isRepublish = Boolean(draft.slug && draft.githubPath);

  // A draft can be empty or half-written while being edited — everything
  // must be present and valid before it becomes a real, published post.
  const parsedFrontmatter = frontmatterSchema.safeParse({
    title: draft.title,
    description: draft.description,
    publishDate,
    updatedDate: isRepublish ? publishDate : undefined,
    tags: draft.tags,
    coverImage: draft.coverImagePath ?? undefined,
    draft: false,
  });
  if (!parsedFrontmatter.success) {
    return Response.json(
      { error: 'This draft is not ready to publish.', details: z.treeifyError(parsedFrontmatter.error) },
      { status: 422 },
    );
  }
  if (!draft.bodyMarkdown.trim()) {
    return Response.json({ error: 'Post body is empty.' }, { status: 422 });
  }

  // Reuse the existing slug on republish (editing an already-live post) so
  // its URL and file path never move under it; otherwise derive a fresh one.
  const slug = draft.slug ?? slugify(draft.title);
  if (!isValidSlug(slug)) {
    return Response.json({ error: 'Could not derive a valid slug from the title.' }, { status: 422 });
  }

  const githubConfig: GitHubConfig = {
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    token: env.GITHUB_PAT,
  };
  const path = draft.githubPath ?? `src/content/posts/${slug}.md`;
  const fileContent = buildPostFileContent(parsedFrontmatter.data, draft.bodyMarkdown);

  let commitResult;
  try {
    // Always re-fetch the current sha immediately before writing — never
    // trust the cached github_sha column — so a concurrent edit made
    // directly in the repo can't be silently overwritten.
    const currentSha = draft.githubPath ? await getFileSha(githubConfig, path) : null;
    commitResult = await commitFile(githubConfig, {
      path,
      content: fileContent,
      message: `${isRepublish ? 'feat(post): update' : 'feat(post): publish'} "${parsedFrontmatter.data.title}"`,
      sha: currentSha ?? undefined,
    });
  } catch (err) {
    const detail = err instanceof GitHubApiError ? err.message : 'Unknown error contacting GitHub.';
    return Response.json({ error: `Failed to commit to GitHub: ${detail}` }, { status: 502 });
  }

  // Only after the GitHub commit succeeds do D1/search state change — if it
  // fails, the draft stays exactly as it was, so git and D1 never disagree
  // about what's actually published.
  const updated = await markDraftPublished(
    env.DB,
    draft.id,
    { slug, githubPath: path, githubSha: commitResult.sha },
    actorEmail,
  );

  await upsertPostInIndex(env.DB, {
    slug,
    title: parsedFrontmatter.data.title,
    body: draft.bodyMarkdown,
    tags: parsedFrontmatter.data.tags,
    publishedAt: updated?.publishedAt ?? publishDate.toISOString(),
  });

  await recordAuditLog(env.DB, {
    actorEmail,
    action: 'post.publish',
    targetType: 'post',
    targetId: slug,
    metadata: { commitSha: commitResult.commitSha, githubPath: path, isRepublish },
  });

  return Response.json({ draft: updated, commitUrl: commitResult.htmlUrl });
};
