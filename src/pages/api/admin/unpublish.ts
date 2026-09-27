import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAccessEmail } from '../../../lib/auth/context';
import { buildPostFileContent } from '../../../lib/content/buildPostFile';
import { recordAuditLog } from '../../../lib/db/auditLog';
import { getDraft, markDraftUnpublished } from '../../../lib/db/drafts';
import { removePostFromIndex } from '../../../lib/db/postsFts';
import { commitFile, getFileSha, GitHubApiError, type GitHubConfig } from '../../../lib/github/contentsApi';
import { frontmatterSchema } from '../../../lib/schemas/frontmatter';
import { publishRequestSchema } from '../../../lib/schemas/publishRequest';

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

  const { slug, githubPath } = draft;
  if (draft.status !== 'published' || !slug || !githubPath) {
    return Response.json({ error: 'This draft is not currently published.' }, { status: 409 });
  }

  // Preserve the original publish date even though the post is being
  // withdrawn — it's still a fact about the post's history.
  const parsedFrontmatter = frontmatterSchema.safeParse({
    title: draft.title,
    description: draft.description,
    publishDate: draft.publishedAt ? new Date(draft.publishedAt) : new Date(),
    tags: draft.tags,
    coverImage: draft.coverImagePath ?? undefined,
    draft: true,
  });
  if (!parsedFrontmatter.success) {
    return Response.json({ error: "Could not rebuild this post's frontmatter." }, { status: 500 });
  }

  const githubConfig: GitHubConfig = {
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    token: env.GITHUB_PAT,
  };
  const fileContent = buildPostFileContent(parsedFrontmatter.data, draft.bodyMarkdown);

  let commitResult;
  try {
    const currentSha = await getFileSha(githubConfig, githubPath);
    commitResult = await commitFile(githubConfig, {
      path: githubPath,
      content: fileContent,
      message: `feat(post): unpublish "${draft.title}"`,
      sha: currentSha ?? undefined,
    });
  } catch (err) {
    const detail = err instanceof GitHubApiError ? err.message : 'Unknown error contacting GitHub.';
    return Response.json({ error: `Failed to commit to GitHub: ${detail}` }, { status: 502 });
  }

  const updated = await markDraftUnpublished(env.DB, draft.id, actorEmail);

  await removePostFromIndex(env.DB, slug);

  await recordAuditLog(env.DB, {
    actorEmail,
    action: 'post.unpublish',
    targetType: 'post',
    targetId: slug,
    metadata: { commitSha: commitResult.commitSha, githubPath },
  });

  return Response.json({ draft: updated, commitUrl: commitResult.htmlUrl });
};
