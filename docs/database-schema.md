# Database Schema

D1 database: `papablog-db`. Schema lives entirely in [`migrations/`](../migrations/) as numbered,
ordered SQL files — there is no separate ORM schema definition to keep in sync.

D1 is the **sole source of truth** for both drafts and published posts (see
[architecture.md](./architecture.md) for why — there is no git-backed content store).

## `drafts`

Every post, published or not, lives as one row in this table from creation onward. (Migration
[`0001`](../migrations/0001_create_drafts.sql), extended by
[`0005`](../migrations/0005_add_drafts_deleted_at.sql) and
[`0006`](../migrations/0006_d1_only_publish_snapshot.sql).)

| Column                       | Type | Notes                                                                                                                                                  |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                         | TEXT | UUID v4 primary key, generated in app code (`crypto.randomUUID()`), not by SQLite.                                                                     |
| `slug`                       | TEXT | Unique. `NULL` until the draft is first published; then fixed for the draft's lifetime.                                                                |
| `title`                      | TEXT | **Always-editable working copy.** Defaults to `''`.                                                                                                    |
| `description`                | TEXT | Always-editable working copy. Defaults to `''`.                                                                                                        |
| `body_markdown`              | TEXT | Always-editable working copy. Defaults to `''`.                                                                                                        |
| `tags`                       | TEXT | Always-editable working copy. JSON array string (e.g. `'["astro","cloudflare"]'`) — SQLite has no native array type.                                   |
| `cover_image_path`           | TEXT | Always-editable working copy. Absolute URL into `/media/...`, or `NULL`.                                                                               |
| `status`                     | TEXT | `CHECK (status IN ('draft','published','archived'))`. See state machine below.                                                                         |
| `published_title`            | TEXT | **Frozen snapshot** of what's actually live. `NULL` until first publish.                                                                               |
| `published_description`      | TEXT | Frozen snapshot. `NULL` until first publish.                                                                                                           |
| `published_body_markdown`    | TEXT | Frozen snapshot. `NULL` until first publish.                                                                                                           |
| `published_tags`             | TEXT | Frozen snapshot, JSON array string. `NULL` until first publish.                                                                                        |
| `published_cover_image_path` | TEXT | Frozen snapshot. `NULL` until first publish or if no cover was set.                                                                                    |
| `created_by`                 | TEXT | Writer email, from the verified Access JWT (or the local test bypass).                                                                                 |
| `updated_by`                 | TEXT | Same, updated on every write.                                                                                                                          |
| `created_at`                 | TEXT | ISO 8601 UTC, `strftime('%Y-%m-%dT%H:%M:%fZ','now')` default.                                                                                          |
| `updated_at`                 | TEXT | Same format; bumped on every `updateDraft`/status-transition call — reflects the **working copy**, not necessarily what's live.                        |
| `published_at`               | TEXT | Set once on first publish, preserved across every later republish — the post's true original publish date.                                             |
| `published_updated_at`       | TEXT | Set to the same value as `published_at` on a first publish (byte-identical, both bound from one JS timestamp); moves forward on every later republish. |
| `deleted_at`                 | TEXT | `NULL` unless the draft is in trash (soft-delete). See trash lifecycle below.                                                                          |

Indexes: `idx_drafts_status`, `idx_drafts_updated_at`, `idx_drafts_deleted_at`.

### Working copy vs. published snapshot

This is the one subtlety worth understanding before touching this table: **the public site never
reads `title`/`description`/`body_markdown`/`tags`/`cover_image_path` directly.** Those are the
writer's always-editable draft, autosaved on every keystroke regardless of publish state. The public
site (`src/lib/db/posts.ts`) reads only the `published_*` columns — a frozen copy taken at the moment
`markDraftPublished` runs, i.e. when the writer clicks **Publish** or **Update & Republish**.

`markDraftPublished` ([`src/lib/db/drafts.ts`](../src/lib/db/drafts.ts)) does the copy in one SQL
statement:

```sql
UPDATE drafts
SET status = 'published',
    slug = ?1,
    published_title = title,
    published_description = description,
    published_body_markdown = body_markdown,
    published_tags = tags,
    published_cover_image_path = cover_image_path,
    published_updated_at = ?2,
    updated_at = ?2,
    published_at = COALESCE(published_at, ?2)
WHERE id = ?3
RETURNING *
```

So: edit a live post's body and walk away — the public version is untouched. Click Publish again —
those edits become the new live snapshot. This preserves the same "edit, then decide to publish"
mental model the git-backed version had, just entirely within D1 instead of gated behind a commit.

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
  `archived`), because unpublishing has a consequence (removal from the search index) that trashing a
  never-published draft does not.
- **`purgeDraft`** / **`purgeAllTrashedDrafts`** only ever `DELETE` rows matching
  `status = 'draft' AND deleted_at IS NOT NULL` — hard-coded in the `WHERE` clause, so even a bug
  elsewhere that somehow marked a published row's `deleted_at` couldn't cause it to be purged.
- **`listDrafts`** always filters `WHERE deleted_at IS NULL` — trashed drafts are invisible to the
  normal editor list by default; `listTrashedDrafts` is the only read path that surfaces them.

## `posts_fts`

A standalone FTS5 virtual table — **not** an external-content table linked to any other table —
because it's a search _cache_ over the `published_*` snapshot, not itself the source of truth.
(Migration [`0002`](../migrations/0002_create_posts_fts.sql).)

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
  matching.
- `title`, `body`, `tags` are the searchable columns. `tags` is stored as space-joined text
  (`tags.join(' ')`), not JSON, since FTS5 tokenizes on whitespace.
- Porter stemming (`porter unicode61`) so a search for "running" also matches "run".

Kept in sync incrementally at publish/unpublish time
([`upsertPostInIndex`](../src/lib/db/postsFts.ts) does a `DELETE` + `INSERT` in one `db.batch()`,
since FTS5 has no native `UPSERT`). `reindexAllPosts` fully rebuilds the table from a caller-supplied
list of posts — used by `POST /api/admin/search-reindex`, which now reads `listPublishedPosts()`
(D1's own published snapshots — the actual source of truth) and rebuilds `posts_fts` from that, the
drift-recovery path if the incremental sync ever falls out of step.

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
| `metadata`    | TEXT    | JSON blob, e.g. `{"isRepublish": true}`.                                                                                                                                                                           |
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

This creates the next-numbered file in `migrations/`. Write the SQL by hand. D1's SQLite supports
`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`, and `ALTER TABLE ... DROP COLUMN`
(used by migration `0006` to remove the old `github_path`/`github_sha` columns) — a column _rename_
or a more structural change still typically means a new-table-and-copy migration instead.

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
before or right after the deploy that depends on the new schema (a new column that's only additive
is safe to apply either order; anything that removes/renames a column the running code still reads
is not, so sequence those deploys accordingly).

Check applied status any time with:

```bash
npx wrangler d1 migrations list papablog-db --remote
```
