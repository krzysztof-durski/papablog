# Content Cleanup & Publish Pipeline

**Model:** Claude Sonnet 5
**Note:** Backfilled retroactively — see docs/prompts/README.md. This entry
covers work still in progress as of its last update.

## Prompts

- "Remove (or remake it as editable) post hello papa blog and continue with
  next steps" → removed the placeholder `hello-world.md` post (remaking it
  as an editable draft didn't make sense before the publish pipeline existed
  to connect a draft to a real committed file).
- "Where are all prompts stored? (Like i asked you to?)" → this log didn't
  actually exist yet despite being part of the original plan; created
  docs/prompts/ and backfilled every prior session from conversation
  history.

## Summary

Removed the scaffold placeholder post. Began the publish pipeline: slug
generation with strict server-side validation (path-traversal safe, since a
slug becomes a GitHub file path segment), a GitHub Contents API wrapper
(tested against a mocked `fetch`, including a UTF-8-safe base64 round-trip
test for non-Latin1 post content), a hand-built YAML-frontmatter file
assembler (round-trip-tested against a real YAML parser rather than just
asserting on the raw string, which caught nothing but was the right way to
gain confidence special characters — colons, quotes, backslashes — are
escaped correctly), and the `/api/admin/publish`, `/api/admin/unpublish`,
and `/api/admin/search-reindex` routes. Publishing only touches D1/search
state after the GitHub commit itself has already succeeded, so git and D1
can't disagree about what's actually live.

## Commits

Not yet committed.
