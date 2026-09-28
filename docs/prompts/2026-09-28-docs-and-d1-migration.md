# Documentation Pass & Git-to-D1 Content Migration

**Model:** Claude Sonnet 5 (mid-session), then Claude Haiku 4.5 and Claude Sonnet 5 again

## Prompts

- "finish docs, commit and push" → wrote the six `docs/*.md` files referenced from `CLAUDE.md` but
  never actually written (`architecture.md`, `database-schema.md`, `security.md`,
  `testing-strategy.md`, `deployment.md`, `content-workflow.md`), documenting the app as it actually
  existed at that point — including calling out gaps (no CI workflows, newsletter table unused,
  security headers not yet implemented) rather than describing aspirational scope.
- "what else do you need me to do?" → listed outstanding manual steps (GitHub PAT secret, Workers
  Builds git integration) vs. code work that could be picked up later.
- "but i said i want posts to be saved in d1 not as .md" → reversed the publish pipeline's
  architecture: published posts had been committed as Markdown files to this repo via the GitHub
  Contents API, read at build time by Astro Content Collections. Clarified two open questions before
  touching code (via AskUserQuestion): drop the GitHub commit entirely (D1-only, no backup), and
  render post pages server-side per request instead of at build time.
- Mid-implementation, caught a design gap the plan hadn't addressed: if the public site read the same
  `drafts` row the editor autosaves into, every keystroke would go live instantly. Asked whether
  edits after publish should go live immediately or require an explicit republish — user chose to
  keep the two-phase model (edit freely, nothing goes live until Publish/Update is clicked again).
- "if docs need changing - change them, commit and push" → after the migration, updated
  `README.md` (still described the old git-based pipeline) and added this log entry.

## Summary

**Docs pass:** wrote all six referenced-but-missing docs files from the actual codebase (not the
original plan), each calling out where reality had already diverged from what was originally
scoped.

**D1 migration:** replaced the git-backed publish pipeline with a D1-only one.

- Added `published_title`/`published_description`/`published_body_markdown`/`published_tags`/
  `published_cover_image_path`/`published_updated_at` columns to `drafts` (migration `0006`, which
  also drops the now-dead `github_path`/`github_sha` columns) — a frozen snapshot of what's live,
  separate from the always-editable working-copy columns, so autosave never pushes unpublished edits
  live. `markDraftPublished` copies working-copy → snapshot in one atomic `UPDATE`.
- New `src/lib/db/posts.ts` read layer (`getPublishedPostBySlug`, `listPublishedPosts`) that only
  ever reads the snapshot columns.
- Rewrote `/api/admin/publish` and `/api/admin/unpublish` to drop the GitHub Contents API dependency
  entirely — publishing is now a single D1 write, live immediately, no rebuild wait.
- Removed `src/content.config.ts` (Content Collections), `src/lib/github/contentsApi.ts`,
  `src/lib/content/buildPostFile.ts`, and the `@astrojs/sitemap` integration (replaced with a
  hand-rolled `sitemap.xml.ts` reading D1 directly, since that integration can't see fully dynamic
  SSR routes — would have silently dropped every post/tag URL from the sitemap).
- Public pages (`/`, `/posts/[slug]`, `/tags`, `/tags/[tag]`, `/rss.xml`, `/sitemap.xml`) converted
  from build-time `getCollection`/`getStaticPaths` to per-request D1 reads.
- Removed the now-unused `GITHUB_PAT`/`GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME` config.
- Verified the whole flow live against a local dev server (not just the test suite): publish → post
  appears instantly on every public surface; edit-without-republish → live version unchanged;
  republish → edit goes live; unpublish → disappears from every surface immediately.
- Found and fixed in passing: `robots.txt` pointed at `/sitemap-index.xml` (the old integration's
  path); now points at `/sitemap.xml`.
- Found but did not fix (pre-existing, unrelated, dormant): `PUT /api/admin/drafts/[id]`'s Zod
  `.partial()` schema resets an omitted field to its default instead of leaving it untouched, if a
  caller sends a genuinely partial body. The real editor always sends every field together, so this
  never triggers via the actual UI — surfaced only by an artificial partial-body test request.
- Rewrote `architecture.md`, `database-schema.md`, `content-workflow.md`, `security.md`,
  `deployment.md`, and `testing-strategy.md` (all six just-written docs) to match, plus `README.md`.

## Commits

See git log for this session's commits.
