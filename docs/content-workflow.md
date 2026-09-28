# Content Workflow

How writing and publishing a post actually works, for future reference. See
[architecture.md](./architecture.md) for the underlying design rationale.

## Writing a post

1. Go to `/admin` (Cloudflare Access will challenge for email OTP if not already signed in) and
   click **New post**, or open an existing draft from the list.
2. Fill in title, description, tags, and an optional cover image
   ([`MediaUploader`](../src/components/admin/MediaUploader.tsx) uploads directly to R2 and fills in
   `coverImagePath`).
3. Write the body in the Markdown textarea. A "?" button next to the "Body (Markdown)" label opens a
   quick syntax cheat sheet.
4. **Pasting from Google Docs (or any rich-text source) works.** The editor intercepts the paste
   event, reads the HTML clipboard payload (not just the plain-text fallback), and converts it to
   Markdown via [`htmlToMarkdown`](../src/lib/format/htmlToMarkdown.ts) before inserting it —
   headings, bold/italic, links, and lists all survive the paste.
5. Everything **autosaves** ~800ms after you stop typing (`PostEditor.tsx`'s debounced `PUT` to
   `/api/admin/drafts/[id]`). There is no manual "save draft" button — the status line under the
   editor reflects `Saving…` / `Saved at HH:MM:SS` / a save error.

## Publishing is now instant — but still a deliberate step

Everything in this app lives in D1 — there's no git commit or rebuild in the publish path anymore.
That means clicking **Publish** takes effect immediately: the post is live at its URL the moment the
request completes, no "check back in a minute" wait.

It is still an **explicit action**, though, not something autosave triggers on its own. Under the
hood, D1 keeps two copies of a post's content in the same row: the always-editable fields you're
typing into (autosaved continuously) and a separate frozen snapshot of what's actually public,
which only changes when you click **Publish** or **Update & Republish**. So you can safely open an
already-published post, fix a typo, get distracted, and come back later — the live version stays
exactly as it was until you explicitly republish. See
[architecture.md](./architecture.md#two-phase-publish-still--just-within-one-table) for the detail.

Clicking **Publish** (`PublishControls.tsx` → `POST /api/admin/publish`):

1. Validates the draft is actually publishable (title/description/tags pass validation, body isn't
   empty). If not, you get an error and nothing changes.
2. Derives a URL slug from the title (first publish only — republishing an already-live post reuses
   its existing slug so the URL never moves).
3. Copies your current title/description/body/tags/cover image into the post's live snapshot, marks
   it `published`, and updates the search index — all in one step.

## Editing an already-published post

Open it from the drafts list (published posts stay listed, tagged "Published") and edit normally —
autosave keeps saving your working copy, but the live version doesn't change. Click **Update &
Republish** to push your edits live; the original publish date is preserved, only the "last updated"
date moves.

## Unpublishing

**Unpublish** (`POST /api/admin/unpublish`) immediately removes the post from the public site — the
home page, tag pages, RSS feed, sitemap, and search all stop showing it right away. The row itself
isn't deleted; its status becomes `archived` and its last-live snapshot is preserved, so you can find
it again in the drafts list and republish it later (reusing the same slug and URL).

## Trashing a draft (never-published only)

Only drafts that have **never been published** can be trashed — this is a workspace cleanup feature
for aborted drafts, not a way to unpublish something live (use Unpublish for that; see above).
Clicking **Delete** in the drafts list moves it to `/admin/trash` (soft-delete: the row stays in D1
with `deleted_at` set, hidden from the normal drafts list). From the trash page you can:

- **Restore** — brings it back to the normal drafts list, fully editable again.
- **Delete permanently** — hard-deletes that one row. Cannot be undone.
- **Empty trash** — hard-deletes every currently-trashed draft in one action. Cannot be undone.

## Field reference

The exact shape a draft must satisfy before `/api/admin/publish` will accept it
([`frontmatterSchema`](../src/lib/schemas/frontmatter.ts)):

| Field         | Required | Notes                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------- |
| `title`       | yes      | 1–200 chars.                                                                           |
| `description` | yes      | 1–300 chars. Used for the meta description, RSS item description, and search fallback. |
| `tags`        | no       | Array of strings, 1–40 chars each. Defaults to `[]`.                                   |
| `coverImage`  | no       | Full URL into `/media/...` (an uploaded R2 image).                                     |
| Post body     | yes      | Cannot be empty/whitespace-only.                                                       |

`publishDate`/`updatedDate` aren't writer-entered fields — they're derived automatically:
`published_at` is set the moment a draft is first published and never changes after that;
`published_updated_at` moves forward on every later republish (see
[database-schema.md](./database-schema.md) for the exact columns).

## If search results look stale

The search index (`posts_fts` in D1) is kept in sync automatically at publish/unpublish time.
If it ever looks out of sync, trigger a full rebuild from an authenticated admin session:

```bash
curl -X POST https://papablog.durski.dev/api/admin/search-reindex \
  -H "Cookie: <your Access session cookie>"
```

(Or simply reload `/admin` in a browser and use `fetch` from devtools — the endpoint requires the
same Access auth as everything else under `/api/admin`.) This rebuilds `posts_fts` entirely from
every currently-published post's live snapshot, which is always the correct source of truth.
