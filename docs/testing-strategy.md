# Testing Strategy

## Test pyramid

```
tests/
├── unit/lib/            — pure functions, no I/O
├── integration/
│   ├── db/               — real D1 (Miniflare) via @cloudflare/vitest-plugin
│   ├── middleware/        — the Access-auth gate
│   └── api/               — full route handlers against real D1/R2
└── e2e/                  — Playwright, not yet built out (see below)
```

Run everything: `npm test` (Vitest) / `npm run test:watch` for local iteration.

### Unit (`tests/unit/lib/`)

Pure functions with no bindings: `allowlist.test.ts`, `slug.test.ts`, `fts-query.test.ts`,
`validate-image.test.ts`, `content-hash.test.ts`, `build-post-file.test.ts`,
`frontmatter-schema.test.ts`, `contents-api.test.ts` (GitHub API client against `fetch` mocks),
`snippet-html.test.ts`. These run fast, with no Miniflare startup cost, and are where edge cases
belong: FTS5 special characters in search input, path-traversal attempts in slugs, malformed MIME
types, GitHub API error-shape handling.

### Integration (`tests/integration/`)

Run against **real D1 and R2**, not mocks, via `@cloudflare/vitest-plugin`'s Miniflare-backed
`cloudflare:test` environment. [`tests/setup/apply-migrations.ts`](../tests/setup/apply-migrations.ts)
applies every migration in `migrations/` before tests run, so the schema under test is exactly the
one that ships.

- `db/drafts.test.ts` — the full draft lifecycle: create, update, list (with/without status filter),
  and the trash flow (trash/restore/list-trashed/purge/purge-all), including the guard tests that
  prove a published draft can never be trashed or purged by these functions regardless of what
  `deleted_at` is manually set to.
- `db/posts-fts.test.ts` — FTS5 upsert/remove/reindex/search against a real FTS5 virtual table
  (FTS5 syntax and ranking behavior can't be meaningfully faked with a mock).
- `db/audit-log.test.ts` — write/list round-trip, including JSON metadata parse failure handling.
- `db/media-r2.test.ts` — real R2 bucket put/get round-trip.
- `middleware/access-auth.test.ts` — the Access-gate behavior itself: valid JWT, expired JWT, wrong
  audience, missing header, disallowed (non-allow-listed) email, and the E2E-bypass path with correct
  vs. incorrect secret/email — using `jose`'s `createLocalJWKSet` with a test keypair instead of a
  real network fetch to Access's JWKS endpoint (`verifyAccessJwt`'s `jwks` parameter is injectable
  specifically for this).
- `api/publish.test.ts` — the full publish route against real D1, with the GitHub Contents API
  itself mocked (it's the one genuinely external dependency), asserting: D1 state only transitions
  after a successful mocked commit, a failed commit leaves the draft untouched, `posts_fts` is
  upserted, and an audit log row is written with the right metadata.

### Why real D1/R2 instead of mocks

D1's actual behaviors — FTS5 tokenization/ranking, `RETURNING` clause semantics, `CHECK` constraints,
unique-index violations, `strftime`-based timestamp defaults — are exactly the things a mock would
have to reimplement to be worth anything, and any drift between a mock's behavior and D1's real
behavior is precisely the kind of bug that only shows up in production. Miniflare runs the real
`workerd` SQLite implementation, so integration tests exercise the actual engine at effectively no
cost beyond Miniflare's (fast) startup.

The one thing that _is_ mocked deliberately is the GitHub Contents API — it's a genuine external
network dependency with rate limits and side effects on a real repo, so `publish.test.ts` and
`unpublish.test.ts`-equivalent coverage mock `fetch` for that call specifically while everything else
(D1 reads/writes, FTS5, audit log) stays real.

## Why the auth test-bypass is safe to rely on in tests

`access-auth.test.ts` exercises `resolveAccessIdentity` directly with `env.E2E_BYPASS_SECRET` set (as
Miniflare's test environment does) — this is testing the _bypass path itself_, which is legitimate
because the bypass's safety property doesn't depend on tests avoiding it. It depends on that
environment variable never existing in the deployed production Worker (see
[security.md](./security.md) for the full argument). Tests can freely exercise both branches of
`resolveAccessIdentity` — the bypass and the real-JWT verification path — because both are real code
that ships; only the _environment_ differs between test/dev and production.

## Playwright E2E — status

`@playwright/test` is a devDependency and `tests/e2e/` doesn't yet contain a checked-in suite.
Feature verification during development has so far been done with one-off manual Playwright scripts
run against `astro dev` and cleaned up after each session, not a maintained suite. Building out a
real `tests/e2e/` directory — public site rendering, responsive layout at a few breakpoints, the full
admin auth → draft → publish flow using the E2E bypass headers against a local `wrangler dev`, and
RSS feed validity — is still pending work (see the project's outstanding-tasks list). When adding
E2E tests, use the bypass headers (`X-E2E-Bypass-Secret` + `X-Test-Access-Email`) against a
`wrangler dev`/`astro dev` instance with `.dev.vars` set — never attempt to drive a real Cloudflare
Access OTP flow from an automated test.

## CI

There is currently no `.github/workflows/` in this repo — lint/typecheck/test are not yet gated on
PRs by GitHub Actions. Locally, the equivalent checks are:

```bash
npm run typecheck   # astro check
npm run lint        # eslint .
npm run format:check
npm test        # vitest run
```

`lefthook` (see `lefthook.yml`) runs a subset of these as git hooks. Setting up a GitHub Actions
workflow to run the same checks on every PR is still pending work.
