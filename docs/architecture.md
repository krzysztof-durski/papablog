# Architecture

## Overview

PapaBlog is an Astro site (`output: 'server'`) deployed as a single Cloudflare Worker via
`@astrojs/cloudflare`. It serves two very different kinds of routes from the same Worker:

- **Public site** — prerendered where possible (home, posts, tags, search, legal pages), read by
  anyone.
- **Admin app** — server-rendered, gated by Cloudflare Access, used only by the writer to draft and
  publish posts.

The two halves share a codebase and a deploy, but deliberately do not share a data model: published
content lives in git, operational admin state lives in D1.

## Content model: git as source of truth

Published posts are Markdown files in `src/content/posts/*.md`, read through Astro Content
Collections (`src/content.config.ts`) with frontmatter validated against
[`frontmatterSchema`](../src/lib/schemas/frontmatter.ts) (title, description, publishDate,
updatedDate, tags, coverImage, coverImageAlt, draft). The filename _is_ the slug — it's never
duplicated into frontmatter, so the two can't drift apart.

This was a deliberate choice over "just store posts in D1":

- **Ownership and portability** — the writer's actual words live in a normal git repo they already
  own, readable/editable outside the app if it ever needs to be replaced.
- **Free history** — every edit is a real commit with a message, not a row overwrite. `git log` on a
  post is the revision history, with no extra schema for it.
- **Free CDN caching** — published pages are prerendered static assets Astro/Cloudflare can cache
  aggressively, with no per-request DB read on the common path (a visitor reading a post never
  touches D1).

The cost of this choice is that "publishing" is not an instant database write — it's a git commit,
which then has to trigger a rebuild before the change is actually live. The admin UI is written to
reflect this (see [content-workflow.md](./content-workflow.md)).

## Operational data: D1

D1 (`papablog-db`, see [database-schema.md](./database-schema.md)) holds everything that is _not_
published content:

- **`drafts`** — the editor's working copy: title/description/body/tags/cover image, autosaved as
  the writer types, plus enough state (`status`, `github_path`, `github_sha`) to know whether a
  given draft has ever been published and where its file lives.
- **`posts_fts`** — an FTS5 full-text search cache over published posts. It is explicitly _not_ the
  source of truth — it's rebuilt/kept in sync from git-published content, and a full rebuild
  (`/api/admin/search-reindex`) is the drift-recovery path if it ever falls out of sync (e.g. a
  failed incremental upsert, or a post edited directly in git outside the app).
- **`audit_log`** — an append-only record of every writer-triggered mutation (`post.publish`,
  `post.unpublish`, `draft.trash`, etc.), each with the actor's verified email.

R2 (`papablog-media` bucket) holds uploaded images, served publicly through
[`src/pages/media/[...path].ts`](../src/pages/media/%5B...path%5D.ts) (deliberately outside the
`/admin` and `/api/admin` prefixes — published posts' images must be readable by everyone, not just
the writer).

## Request lifecycle

### Public request (e.g. `GET /posts/my-slug`)

1. Request hits the Worker. `src/middleware.ts` checks the path against `PROTECTED_PREFIXES`
   (`/admin`, `/api/admin`) — a public path skips the Access gate entirely and falls straight
   through to `next()`.
2. Astro renders the route. Public pages are prerendered where their content allows it, so most
   public traffic is served as a static asset by Cloudflare's edge without invoking the Worker's
   render path at all.
3. `/api/search` is the one public route that _is_ server-rendered per-request — it queries
   `posts_fts` directly (see below).

### Admin/API request (e.g. `POST /api/admin/publish`)

1. `src/middleware.ts`'s `accessGate` matches the path and calls
   [`resolveAccessIdentity`](../src/lib/auth/resolveAccessIdentity.ts).
2. In production, that function requires and verifies the `Cf-Access-Jwt-Assertion` header (see
   [security.md](./security.md) for the full auth model) and cross-checks the verified email against
   `ALLOWED_WRITER_EMAILS`. Any failure returns a bare `403 Forbidden` with no detail about _why_ —
   the middleware never leaks whether a token was missing, expired, wrong-audience, or the email was
   simply not allow-listed.
3. On success, `context.locals.accessEmail` is set and the request proceeds to the actual route
   handler, which reads it back via [`getAccessEmail(locals)`](../src/lib/auth/context.ts) for
   autosave ownership and audit-log attribution.

### Publish flow (the one multi-step write path)

`POST /api/admin/publish` ([source](../src/pages/api/admin/publish.ts)) is the most involved route
in the app, because it's the only place the two data stores (git and D1) have to end up agreeing.
The order of operations is deliberate:

1. Load the draft from D1, validate its frontmatter fields and body against `frontmatterSchema` —
   reject with `422` before touching anything external if the draft isn't publishable yet.
2. Derive (or reuse, on republish) a slug via [`slugify`/`isValidSlug`](../src/lib/slug.ts) — the
   only place a writer-controlled string becomes a GitHub file path, so it's re-validated here
   regardless of what's stored.
3. Re-fetch the current GitHub blob `sha` for that path immediately before writing (never trust the
   cached `github_sha` column) via [`getFileSha`](../src/lib/github/contentsApi.ts), so a concurrent
   edit made directly in the repo isn't silently clobbered.
4. Commit the file via GitHub's Contents API. **If this fails, the function returns immediately** —
   nothing else runs, so a draft that fails to publish never has partially-published state anywhere.
5. Only once the commit succeeds: mark the draft `published` in D1, upsert it into `posts_fts`, and
   write an `audit_log` row. Each of these three steps assumes the previous one succeeded — the
   commit is the one step whose success actually matters; the rest is bookkeeping.

The commit to `main` this produces is what Cloudflare Workers Builds picks up to rebuild and
redeploy the static site (see [deployment.md](./deployment.md)) — publishing is a git push, not a
live CMS write, which is why the admin UI communicates "publishing… live in ~1–2 min" rather than
implying an instant update.

`/api/admin/unpublish` is the mirror image: it commits the same file back with `draft: true`
(preserving the original `publishDate` as history), demotes the draft row to `archived`, and removes
it from `posts_fts`.

## Search

`GET /api/search` ([source](../src/pages/api/search.ts)) queries `posts_fts` via
[`searchPosts`](../src/lib/db/postsFts.ts) using FTS5's `MATCH` operator. Because FTS5 has its own
query mini-language distinct from SQL (operators like `AND`/`OR`/`NOT`/`NEAR`, `*` prefix matching,
unbalanced `"` breaking the parser), raw user input is never handed to `MATCH` directly — every
search term is individually wrapped as a quoted literal phrase by
[`toFtsMatchQuery`](../src/lib/security/ftsQuery.ts) before being ANDed together. This is a distinct
sanitization pass from Zod validation; parameterized binding alone does not neutralize FTS5 syntax
injection, since the bound value is itself re-parsed as a query string by the FTS5 engine.

## Why the two-store split holds up

The one invariant the whole design leans on: **a published post is only ever "real" once the GitHub
commit succeeds.** D1's `drafts.status = 'published'` and `posts_fts` are always _derived from_ that
fact, never the other way around — which is what makes `/api/admin/search-reindex` a safe, simple
recovery tool (rebuild D1 state from git, the actual source of truth) rather than something that
could itself introduce drift.
