# Draft CRUD & the React Post Editor

**Model:** Claude Sonnet 5
**Note:** Backfilled retroactively — see docs/prompts/README.md.

## Prompts

- "continue with next steps" (proceeded to the draft editor per the build
  order).
- "desktop view has bad two columns and not full window editor" → the editor
  was constrained by the blog's narrow prose-width container; added a `wide`
  layout option and rebuilt the editor's internal layout to use real screen
  space, with the textarea and preview pane given matching heights.

## Summary

Built full draft CRUD against D1 (create/get/list/update/delete, delete
refusing to touch published posts), the `PostEditor` React island with a
live markdown preview and 800ms-debounced autosave, and cover-image upload
(client-side Canvas resize/re-encode to WebP before upload, content-addressed
storage in R2, served back through a new public `/media/*` route). Verified
the whole flow in an actual browser rather than only via unit tests, which
caught a real bug: the upload endpoint returned a relative path but the
schema required an absolute URL, so autosave silently failed right after
every cover image upload. Fixed by building the absolute URL from the
request's own origin. Redesigned the editor layout after direct feedback
that it looked cramped on desktop.

## Commits

Not yet committed.
