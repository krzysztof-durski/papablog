# Database Schema

D1 database: `papablog-db`. Schema lives entirely in [`migrations/`](../migrations/) as numbered,
ordered SQL files — there is no separate ORM schema definition to keep in sync.

D1 stores **operational data only**. Published post content is never stored here — see
[architecture.md](./architecture.md) for why git is the source of truth for that.

## `drafts`

The editor's working copy of every post, published or not. One row per post, from creation through
every future republish. (Migration [`0001`](../migrations/0001_create_drafts.sql), extended by
[`0005`](../migrations/0005_add_drafts_deleted_at.sql).)

| Column             | Type | Notes                                                                                                                                                                                       |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | TEXT | UUID v4 primary key, generated in app code (`crypto.randomUUID()`), not by SQLite.                                                                                                          |
| `slug`             | TEXT | Unique. `NULL` until the draft is first published; then fixed for the draft's lifetime.                                                                                                     |
| `title`            | TEXT | Defaults to `''`.                                                                                                                                                                           |
| `description`      | TEXT | Defaults to `''`.                                                                                                                                                                           |
| `body_markdown`    | TEXT | Defaults to `''`. Post body in Markdown.                                                                                                                                                    |
| `tags`             | TEXT | JSON array string (e.g. `'["astro","cloudflare"]'`) — SQLite has no native array type.                                                                                                      |
| `cover_image_path` | TEXT | Absolute URL into `/media/...`, or `NULL`.                                                                                                                                                  |
| `status`           | TEXT | `CHECK (status IN ('draft','published','archived'))`. See state machine below.                                                                                                              |
| `github_path`      | TEXT | e.g. `src/content/posts/my-slug.md`. `NULL` until first publish.                                                                                                                            |
| `github_sha`       | TEXT | Last known blob sha after a successful commit. **Never trusted for the next commit** — the publish route always re-fetches the current sha from GitHub first; this column is only a record. |
| `created_by`       | TEXT | Writer email, from the verified Access JWT (or the local test bypass).                                                                                                                      |
| `updated_by`       | TEXT | Same, updated on every write.                                                                                                                                                               |
| `created_at`       | TEXT | ISO 8601 UTC, `strftime('%Y-%m-%dT%H:%M:%fZ','now')` default.                                                                                                                               |
| `updated_at`       | TEXT | Same format; bumped on every `updateDraft`/status-transition call.                                                                                                                          |
| `published_at`     | TEXT | Set once on first publish via `COALESCE`, preserved across every later republish.                                                                                                           |
| `deleted_at`       | TEXT | `NULL` unless the draft is in trash (soft-delete). See trash lifecycle below.                                                                                                               |

Indexes: `idx_drafts_status`, `idx_drafts_updated_at`, `idx_drafts_deleted_at`.

### Status state machine

```
draft ──(publish)──► published ──(unpublish)──► archived
  │
  └──(trash)──► [deleted_at set] ──(restore)──► draft
  │
  └──(purge)──► [row deleted]
```

Rules enforced in [`src/lib/db/drafts.ts`](../src/lib/db/drafts.ts), not just at the API layer:

- **`trashDraft`** only affects rows with `status = 'draft' AND deleted_at IS NULL` — a published or
  already-trashed draft is a no-op (returns `null`). A published post can never accidentally end up
  in the trash flow; withdrawing a live post is a separate action (`markDraftUnpublished` →
  `archived`), because unpublishing has consequences (a GitHub commit, removal from the search
  index) that trashing a never-published draft does not.
- **`purgeDraft`** / **`purgeAllTrashedDrafts`** only ever `DELETE` rows matching
  `status = 'draft' AND deleted_at IS NOT NULL` — hard-coded in the `WHERE` clause, so even a bug
  elsewhere that somehow marked a published row's `deleted_at` couldn't cause it to be purged.
- **`listDrafts`** always filters `WHERE deleted_at IS NULL` — trashed drafts are invisible to the
  normal editor list by default; `listTrashedDrafts` is the only read path that surfaces them.

## `posts_fts`

A standalone FTS5 virtual table — **not** an external-content table linked to any other table —
because D1 is a search _cache_, not the source of truth for published content (git is). (Migration
[`0002`](../migrations/0002_create_posts_fts.sql).)

```sql
CREATE VIRTUAL TABLE posts_fts USING fts5(
  slug UNINDEXED,
  title,
  body,
  tags,
  published_at UNINDEXED,
  tokenize = 'porter unicode61'
);
```

- `slug` and `published_at` are `UNINDEXED` — stored and returned in results, but not tokenized for
  matching (there's no reason to full-text search a slug or a timestamp).
- `title`, `body`, `tags` are the searchable columns. `tags` is stored as space-joined text
  (`tags.join(' ')`), not JSON, since FTS5 tokenizes on whitespace.
- Porter stemming (`porter unicode61`) so a search for "running" also matches "run".

Kept in sync incrementally at publish/unpublish time
([`upsertPostInIndex`](../src/lib/db/postsFts.ts) does a `DELETE` + `INSERT` in one `db.batch()`,
since FTS5 has no native `UPSERT`). `reindexAllPosts` fully rebuilds the table from a caller-supplied
list of posts — used by `POST /api/admin/search-reindex`, which reads the actual published content
collection from git and rebuilds D1 from it, the drift-recovery path if the incremental sync ever
falls out of step.

## `audit_log`

Append-only record of every writer-triggered mutation. (Migration
[`0004`](../migrations/0004_create_audit_log.sql).)

| Column        | Type    | Notes                                                                                                                                                                                                              |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | INTEGER | Autoincrement primary key.                                                                                                                                                                                         |
| `actor_email` | TEXT    | Verified `email` claim from the Access JWT — never client-supplied.                                                                                                                                                |
| `action`      | TEXT    | One of the `AuditAction` union in [`auditLog.ts`](../src/lib/db/auditLog.ts): `post.publish`, `post.unpublish`, `draft.create`, `draft.trash`, `draft.restore`, `draft.purge`, `draft.purgeAll`, `search.reindex`. |
| `target_type` | TEXT    | `'post'`, `'draft'`, or `'search_index'`.                                                                                                                                                                          |
| `target_id`   | TEXT    | Slug or draft id; nullable (e.g. a full reindex has no single target).                                                                                                                                             |
| `metadata`    | TEXT    | JSON blob, e.g. `{"commitSha": "...", "githubPath": "..."}`.                                                                                                                                                       |
| `created_at`  | TEXT    | ISO 8601 UTC, defaulted.                                                                                                                                                                                           |

Indexes: `idx_audit_log_created_at`, `idx_audit_log_actor`. Write path
([`recordAuditLog`](../src/lib/db/auditLog.ts)) is fire-and-forget from each route's perspective —
always called _after_ the operation it's recording has already succeeded, never used to gate
whether an operation is allowed to proceed.

## `newsletter_subscribers`

Migration [`0003`](../migrations/0003_create_newsletter_subscribers.sql) exists (email, double
opt-in token/expiry, unsubscribe token, salted IP hash, status), but **no application code reads or
writes this table yet** — the newsletter feature itself (signup form, confirm/unsubscribe endpoints,
send pipeline) is not implemented. The table is provisioned ahead of that work so the migration
history stays linear; do not assume subscriber data exists anywhere yet.

## Migration workflow

Migrations are plain numbered SQL files in `migrations/`, applied via Wrangler — there is no
separate migration-runner library.

**Adding a migration:**

```bash
npx wrangler d1 migrations create papablog-db <short-description>
```

This creates the next-numbered file in `migrations/`. Write the SQL by hand (`CREATE TABLE IF NOT
EXISTS`, `ALTER TABLE ... ADD COLUMN`, etc. — D1's SQLite dialect doesn't support most other `ALTER
TABLE` forms, so a column rename or drop typically means a new-table-and-copy migration instead).

**Local dev / tests:**

```bash
npx wrangler d1 migrations apply papablog-db --local
```

The Vitest integration suite applies migrations automatically per test run via
[`tests/setup/apply-migrations.ts`](../tests/setup/apply-migrations.ts) (`applyD1Migrations` against
the Miniflare-backed `env.DB`), so there's no manual step needed before `npm test`.

**Production (after merging a migration):**

```bash
npx wrangler d1 migrations apply papablog-db --remote
```

This is a manual step — it does not run automatically as part of a Workers Builds deploy. Run it
before or right after the deploy that depends on the new schema (a new column that's only additive,
like `deleted_at`, is safe to apply either order; anything that removes/renames a column the running
code still reads is not, so sequence those deploys accordingly).

Check applied status any time with:

```bash
npx wrangler d1 migrations list papablog-db --remote
```
