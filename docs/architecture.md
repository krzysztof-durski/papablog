# Architecture

## Overview

PapaBlog is an Astro site (`output: 'server'`) deployed as a single Cloudflare Worker via
`@astrojs/cloudflare`. It serves two very different kinds of routes from the same Worker:

- **Public site** — the pages that don't depend on D1 (home's-adjacent static pages like About and
  the legal pages) are prerendered at build time; everything that reads live content — posts, tags,
  search, RSS, the sitemap — is server-rendered per request against D1.
- **Admin app** — server-rendered, gated by Cloudflare Access, used only by the writer to draft and
  publish posts.

## Content model: D1 is the sole source of truth

Both drafts and published posts live in a single D1 table, `drafts` (see
[database-schema.md](./database-schema.md)). There is no separate git-backed content store — an
earlier version of this app committed published posts as Markdown files to GitHub and had Astro
Content Collections read them at build time; that's been replaced entirely by direct D1 reads, so
publishing no longer waits on a rebuild.

### Two-phase publish, still — just within one table

Collapsing everything into D1 raised an immediate question: if the public site just reads the same
row the writer is actively autosaving into, wouldn't every keystroke go live instantly? That's not
the desired behavior — a writer editing a typo in an already-published post shouldn't have it go
live until they decide to.

The fix is a snapshot pattern within the `drafts` row itself:

- `title`, `description`, `body_markdown`, `tags`, `cover_image_path` are the **always-editable
  working copy** — autosaved ~800ms after every keystroke in the admin editor
  ([`PostEditor.tsx`](../src/components/admin/PostEditor.tsx)), regardless of whether the post has
  ever been published.
- `published_title`, `published_description`, `published_body_markdown`, `published_tags`,
  `published_cover_image_path` are a **frozen snapshot** of what's actually live. They're only ever
  written by [`markDraftPublished`](../src/lib/db/drafts.ts), which copies the current working-copy
  columns into their `published_*` counterparts as a single `UPDATE ... SET published_title = title,
...` — triggered only when the writer clicks **Publish** (or **Update & Republish**).

The public site ([`src/lib/db/posts.ts`](../src/lib/db/posts.ts)) reads **only** the `published_*`
columns, never the working-copy ones. This means: editing a live post's body and walking away leaves
the public version untouched; clicking Publish again is what pushes those edits live. Publishing
itself is now instant (no rebuild wait) — but it's still an explicit, one-click action, not
autosave-driven.

`published_at` is set once (via `COALESCE`) and never changes on a republish — it's the post's true
original publish date. `published_updated_at` moves on every republish, which is how
[`PostLayout.astro`](../src/layouts/PostLayout.astro) knows whether to show an "Updated" badge (it
compares the two; they're bound to the exact same JS-computed timestamp on a first publish, so
they're guaranteed equal then, and only diverge after a real republish).

### Why one table instead of two

A published post's fields are a strict subset of a draft's fields info-wise (title, description,
body, tags, cover image) — the only thing that changes is whether there's a frozen snapshot to read.
Keeping both in one row avoids a join on every public page render and keeps the state machine
(`draft → published → archived`, trash) in one place, which is already how
[`src/lib/db/drafts.ts`](../src/lib/db/drafts.ts) models it. `src/lib/db/posts.ts` is a thin,
public-facing read layer over the same table, not a separate store.

### Full-text search stays a cache, same as before

[`posts_fts`](./database-schema.md#posts_fts) is unchanged in shape and purpose: an FTS5 cache kept
in sync at publish/unpublish time, upserted from whatever content just became the live snapshot. It
remains a cache, not a second source of truth — `POST /api/admin/search-reindex` still exists as a
full-rebuild safety valve, now sourced from `listPublishedPosts()` (D1) instead of a git content
collection.

R2 (`papablog-media` bucket) still holds uploaded images, served publicly through
[`src/pages/media/[...path].ts`](../src/pages/media/%5B...path%5D.ts) — unaffected by this change.

## Request lifecycle

### Public request (e.g. `GET /posts/my-slug`)

1. Request hits the Worker. `src/middleware.ts` checks the path against `PROTECTED_PREFIXES`
   (`/admin`, `/api/admin`) — a public path skips the Access gate entirely and falls straight
   through to `next()`.
2. The route handler queries D1 directly (`getPublishedPostBySlug`/`listPublishedPosts` from
   `src/lib/db/posts.ts`) and renders the page per request — `prerender = false`. Static pages that
   don't depend on live content (About, legal pages) still opt into build-time prerendering.
3. A post's Markdown body is rendered to HTML at request time via `marked` (the same library already
   used for the admin editor's live preview) — there's no build-time Markdown compilation step
   anymore.

### Admin/API request (e.g. `POST /api/admin/publish`)

1. `src/middleware.ts`'s `accessGate` matches the path and calls
   [`resolveAccessIdentity`](../src/lib/auth/resolveAccessIdentity.ts).
2. In production, that function requires and verifies the `Cf-Access-Jwt-Assertion` header (see
   [security.md](./security.md)) and cross-checks the verified email against
   `ALLOWED_WRITER_EMAILS`. Any failure returns a bare `403 Forbidden` with no detail about _why_.
3. On success, `context.locals.accessEmail` is set and the request proceeds to the actual route
   handler, which reads it back via [`getAccessEmail(locals)`](../src/lib/auth/context.ts) for
   autosave ownership and audit-log attribution.

### Publish flow

`POST /api/admin/publish` ([source](../src/pages/api/admin/publish.ts)):

1. Load the draft from D1, validate its frontmatter-shaped fields and body against
   [`frontmatterSchema`](../src/lib/schemas/frontmatter.ts) — reject with `422` before touching
   anything else if the draft isn't publishable yet.
2. Derive (or reuse, on republish) a slug via [`slugify`/`isValidSlug`](../src/lib/slug.ts) — the
   slug is a public URL segment, so it's still validated server-side regardless of what's stored.
3. Call `markDraftPublished`, which atomically flips `status` to `published`, sets `slug`, and
   copies the working-copy columns into the `published_*` snapshot columns, all in one `UPDATE`. A
   `slug` uniqueness conflict (the column has a `UNIQUE` constraint) is caught and returned as `409`.
4. Upsert the post into `posts_fts` and write an `audit_log` row.

There is no external step this depends on succeeding first (unlike the old GitHub-commit-gated
version) — step 3 either succeeds as one atomic D1 write or the whole request fails before anything
changes.

`/api/admin/unpublish` is the mirror image: `markDraftUnpublished` flips `status` to `archived`
(preserving `slug`/`published_at`/the snapshot as history — nothing is deleted), and the post is
removed from `posts_fts`.

## Search

`GET /api/search` ([source](../src/pages/api/search.ts)) queries `posts_fts` via
[`searchPosts`](../src/lib/db/postsFts.ts) using FTS5's `MATCH` operator. Because FTS5 has its own
query mini-language distinct from SQL, raw user input is never handed to `MATCH` directly — every
search term is individually wrapped as a quoted literal phrase by
[`toFtsMatchQuery`](../src/lib/security/ftsQuery.ts) before being ANDed together, so none of FTS5's
operator syntax can be injected through search input. (This part of the design is unchanged by the
D1-only content migration — it was already fully decoupled from git.)

## Sitemap and RSS

Both [`src/pages/rss.xml.ts`](../src/pages/rss.xml.ts) and
[`src/pages/sitemap.xml.ts`](../src/pages/sitemap.xml.ts) are server-rendered (`prerender = false`)
and built from `listPublishedPosts()` per request. The sitemap is hand-written rather than using
`@astrojs/sitemap`, because that integration only discovers routes Astro can see at build time
(static pages and `getStaticPaths` output) — with post and tag pages now fully dynamic, it would
silently omit them.
