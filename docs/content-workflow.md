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
   headings, bold/italic, links, and lists all survive the paste. This exists specifically because
   Google Docs doesn't use semantic tags (`<strong>`, `<h1>`) for its formatting — it uses inline
   `style` attributes (`font-weight`, `font-size`), which the converter has dedicated rules for.
5. Everything **autosaves** ~800ms after you stop typing (`PostEditor.tsx`'s debounced `PUT` to
   `/api/admin/drafts/[id]`). There is no manual "save draft" button — the status line under the
   editor reflects `Saving…` / `Saved at HH:MM:SS` / a save error.

Autosaved drafts only ever live in D1 — nothing is written to git until you explicitly publish.

## Publishing

Clicking **Publish** (`PublishControls.tsx` → `POST /api/admin/publish`) does the following, in
order (see [architecture.md](./architecture.md#publish-flow-the-one-multi-step-write-path) for the
full detail):

1. Validates the draft is actually publishable (title/description/tags pass frontmatter validation,
   body isn't empty). If not, you get a `422` with the specific validation error — nothing else
   happens.
2. Derives a URL slug from the title (first publish only — republishing an already-live post reuses
   its existing slug so the URL never moves).
3. **Commits a real Markdown file** to `src/content/posts/<slug>.md` in the GitHub repo via the
   GitHub Contents API, with a commit message like `feat(post): publish "My Title"`.
4. Only once that commit succeeds: marks the draft `published` in D1, adds it to the search index,
   and logs the action.

**Publishing is a git push, not a live CMS write — the post is not visible on the site the instant
you click Publish.** The commit to `main` triggers Cloudflare Workers Builds to rebuild and redeploy
the static site, which typically takes about a minute or two. The admin UI's status line reflects
this ("publishing… live in ~1–2 min") rather than implying an instant update — if you check the live
URL immediately after publishing and it 404s, that's expected; wait for the rebuild.

## Editing an already-published post

Open it from the drafts list (published posts stay listed, tagged "Published") and edit normally —
autosave still only touches D1. Clicking **Publish** again commits the updated file to the _same_
path with an `updatedDate` set, preserving the original `publishDate`. The commit message reads
`feat(post): update "..."` instead of `publish`.

## Unpublishing

**Unpublish** (`POST /api/admin/unpublish`) commits the same file back with `draft: true` in its
frontmatter — Astro's Content Collections will then exclude it from `getCollection('posts', ({data})
=> !data.draft)` calls (home page, RSS feed, tag pages, `/api/search`'s index), which is what
actually removes it from the live site on the next rebuild. The original `publishDate` is preserved
in the frontmatter (it's still a true fact about the post's history), and the D1 row is marked
`archived`, not deleted — you can find it again in the drafts list and republish it later, which
reuses the same slug and file path.

The file itself is never deleted from git by this action — only its `draft` flag flips. Actually
deleting the Markdown file from the repo is not something the admin UI does; that would be a manual
git operation outside this app.

## Trashing a draft (never-published only)

Only drafts that have **never been published** can be trashed — this is a workspace cleanup feature
for aborted drafts, not a way to unpublish something live (use Unpublish for that; see above).
Clicking **Delete** in the drafts list moves it to `/admin/trash` (soft-delete: the row stays in D1
with `deleted_at` set, hidden from the normal drafts list). From the trash page you can:

- **Restore** — brings it back to the normal drafts list, fully editable again.
- **Delete permanently** — hard-deletes that one row. Cannot be undone.
- **Empty trash** — hard-deletes every currently-trashed draft in one action. Cannot be undone.

## Frontmatter field reference

The exact shape every published Markdown file's frontmatter must match
([`frontmatterSchema`](../src/lib/schemas/frontmatter.ts)):

| Field           | Required | Notes                                                                                                                                                |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`         | yes      | 1–200 chars.                                                                                                                                         |
| `description`   | yes      | 1–300 chars. Used for the meta description, RSS item description, and search results snippet fallback.                                               |
| `publishDate`   | yes      | Set automatically to the moment of first publish. Never manually editable in the UI.                                                                 |
| `updatedDate`   | no       | Set automatically on every republish after the first. Omitted on a post's first publish.                                                             |
| `tags`          | no       | Array of strings, 1–40 chars each. Defaults to `[]`.                                                                                                 |
| `coverImage`    | no       | Full URL into `/media/...` (an uploaded R2 image) — not a local file path.                                                                           |
| `coverImageAlt` | no       | Max 200 chars.                                                                                                                                       |
| `draft`         | yes      | `true` hides the post from all public listings/feeds/search without deleting the file. Always `false` on a live publish; set to `true` by Unpublish. |

Every one of these is validated server-side before a commit is ever made — hand-editing a post's
frontmatter directly in git is possible (it's just a file), but it must still satisfy this schema or
Astro's build will fail on it, and it won't show up correctly in `/api/admin/search-reindex` until
the schema is satisfied.

## If search results look stale

The search index (`posts_fts` in D1) is kept in sync automatically at publish/unpublish time.
If it ever looks out of sync with what's actually live (e.g. after a manual git edit outside the
admin UI), trigger a full rebuild from an authenticated admin session:

```bash
curl -X POST https://papablog.durski.dev/api/admin/search-reindex \
  -H "Cookie: <your Access session cookie>"
```

(Or simply reload `/admin` in a browser and use `fetch` from devtools — the endpoint requires the
same Access auth as everything else under `/api/admin`.) This rebuilds `posts_fts` entirely from the
current published content collection, which is always the correct source of truth.
