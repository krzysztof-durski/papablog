# Security

Living reference for PapaBlog's security posture. Update this file whenever the auth model,
secrets, or validation policy actually change — it should always describe the code as it is, not as
originally planned.

## Auth model: Cloudflare Access + independent re-verification

`/admin*` and `/api/admin/*` are protected in two independent layers, so a failure in either one
alone doesn't grant access:

1. **Edge layer — Cloudflare Access.** The custom domain (`papablog.durski.dev`) has a Zero Trust
   Access application in front of those paths, requiring email OTP login. Unauthenticated requests
   are challenged/blocked by Cloudflare before they ever reach the Worker. This is why the
   `workers.dev` preview subdomain is deliberately disabled in `wrangler.jsonc`
   (`workers_dev: false`) — Access cannot protect that subdomain, so it must never be a live entry
   point in production.
2. **Application layer — independent JWT verification.** The Worker does not trust Access's edge
   enforcement alone. [`src/middleware.ts`](../src/middleware.ts) gates every request under
   `/admin` or `/api/admin` through [`resolveAccessIdentity`](../src/lib/auth/resolveAccessIdentity.ts),
   which:
   - Reads the `Cf-Access-Jwt-Assertion` header Access attaches to authenticated requests.
   - Verifies its signature against Access's own JWKS
     (`https://<team-domain>/cdn-cgi/access/certs`, fetched via `jose`'s `createRemoteJWKSet` and
     cached at module scope in [`accessJwks.ts`](../src/lib/auth/accessJwks.ts)), plus issuer and
     audience (`ACCESS_AUD`).
   - Extracts the verified `email` claim and checks it against `ALLOWED_WRITER_EMAILS` via
     [`isAllowedWriter`](../src/lib/auth/allowlist.ts) — **defense-in-depth**: even if the Access
     application's own policy were ever misconfigured to allow more identities than intended, this
     second check independently re-restricts to the actual writer(s).

Any failure at any step (missing header, bad signature, wrong issuer/audience, expired token, email
not allow-listed) returns a bare `403 Forbidden` with no distinguishing detail — the response never
tells a caller _which_ check failed, so a probing request can't learn anything about the auth
configuration.

### Local dev / test bypass — why it's structurally safe, not just disabled-by-config

`resolveAccessIdentity` has a second code path, gated entirely on whether `E2E_BYPASS_SECRET` is
set in the environment:

- If it's set: a plain request with no bypass headers is treated as the first configured writer
  (so `/admin` just works locally with zero setup); a request carrying
  `X-E2E-Bypass-Secret` + `X-Test-Access-Email` headers is accepted only if the secret matches
  exactly and the email is itself allow-listed — used by tests that need to simulate a specific
  (including a specifically _disallowed_) identity.
- If it's unset: this whole branch is skipped and only the real Access JWT path runs.

The safety property isn't "remember to unset it in production" — it's that `E2E_BYPASS_SECRET` is
simply **never a key in production's `vars`/secrets** (see `wrangler.jsonc` and the secrets list
below). It only ever exists via a local `.dev.vars` file (gitignored, see `.dev.vars.example`) or a
CI-only secret for Playwright runs. There is no config flag to accidentally leave on — the bypass
code is dead code in the deployed Worker because the binding it checks doesn't exist there.

## Content validation and the GitHub write path

- **Every API route** that accepts a body validates it against a co-located Zod schema
  (`src/lib/schemas/*.ts`) before doing anything else with it.
- **Frontmatter** (`title`, `description`, `publishDate`, `tags`, `coverImage`, etc.) is validated
  against the exact same [`frontmatterSchema`](../src/lib/schemas/frontmatter.ts) in two places that
  must never drift apart: Astro's Content Collections config (build-time validation of every file
  already in the repo) and `/api/admin/publish` (validated before a draft is ever turned into a
  commit).
- **Slugs are never trusted from client input.** A slug becomes a literal GitHub file path
  (`src/content/posts/<slug>.md`) — the one place in the app where a writer-influenced value turns
  directly into a repo path. [`slugify`](../src/lib/slug.ts) derives it server-side from the title,
  and [`isValidSlug`](../src/lib/slug.ts) (`^[a-z0-9]+(-[a-z0-9]+)*$`, max 100 chars) is re-checked
  immediately before every publish, regardless of what's stored on the draft.
- **GitHub API responses are validated, not just cast.** [`contentsApi.ts`](../src/lib/github/contentsApi.ts)
  runs runtime type guards (`isShaObject`, `isCommitResponse`, etc.) over `fetch().json()`'s `unknown`
  result before using any field from it — treating GitHub's response the same as any other untrusted
  external input, not something a TypeScript cast alone makes safe.
- **Publish is commit-gated, not D1-gated.** D1 state (`drafts.status`, `posts_fts`, `audit_log`)
  only changes _after_ the GitHub commit succeeds — see [architecture.md](./architecture.md) for the
  full ordering. This means a failed publish can never leave the app believing something is live
  that isn't actually in git.

## D1 query safety

- **Every query is parameterized** (`db.prepare(...).bind(...)`) — there is no string-concatenated
  SQL anywhere in the codebase.
- **FTS5 is a second injection surface, handled separately.** SQLite's FTS5 `MATCH` operator has its
  own query mini-language (`AND`/`OR`/`NOT`/`NEAR`, `*` prefix matching, `:` column filters,
  unbalanced `"` breaking the parser) that parameterized binding does **not** neutralize on its own —
  the bound string is itself re-parsed by the FTS5 engine. [`toFtsMatchQuery`](../src/lib/security/ftsQuery.ts)
  wraps every user-supplied search term as its own quoted literal phrase (escaping internal `"` per
  FTS5 string-literal rules) before it ever reaches `MATCH`, so none of that operator syntax can be
  injected through search input.

## Media upload validation

`POST /api/admin/drafts/[id]/media` ([source](../src/pages/api/admin/drafts/%5Bid%5D/media.ts)):

- MIME type allow-list: `image/png`, `image/jpeg`, `image/webp`, `image/avif` only
  ([`validateImageUpload`](../src/lib/media/validateImage.ts)).
- Size cap: 5MB (`MAX_IMAGE_BYTES`).
- Stored content-addressed in R2 (`posts/<draftId>/<sha256-of-content>.<ext>`) via
  [`hashImageContent`](../src/lib/media/contentHash.ts) — re-uploading identical bytes reuses the
  same key rather than accumulating duplicates.
- Served back publicly through [`/media/[...path]`](../src/pages/media/%5B...path%5D.ts) with a
  1-year immutable `Cache-Control`, since the content hash in the key means the URL only ever points
  at one exact set of bytes.

## Secrets and configuration

Plain vars (`wrangler.jsonc` → `vars`, non-secret, fine to see in the repo):
`ENVIRONMENT`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_WRITER_EMAILS`, `GITHUB_REPO_OWNER`,
`GITHUB_REPO_NAME`.

Secrets (never in the repo — set via `wrangler secret put <NAME>` for production, or a local
`.dev.vars` file for dev, per `.dev.vars.example`):

| Secret              | Scope                         | Notes                                                                                                                |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`        | Production                    | **Fine-grained PAT, scoped to the `papablog` repo only, Contents read/write.** Never a classic PAT with broad scope. |
| `E2E_BYPASS_SECRET` | Local dev / CI test runs only | **Must never be set in the production environment** — see the bypass section above.                                  |

### PAT rotation procedure

1. In GitHub → Settings → Developer settings → Fine-grained tokens, generate a new token scoped
   identically to the current one (repository: `papablog` only; permission: Contents — Read and
   write; no other repository or account permissions).
2. `npx wrangler secret put GITHUB_PAT` and paste the new token.
3. Confirm a test publish/unpublish succeeds against production.
4. Revoke the old token in GitHub.

Rotate immediately (not on the routine schedule) if: the token may have been exposed in a log,
screenshot, or shared terminal; a Cloudflare account collaborator with `wrangler secret` access is
removed; or GitHub flags anomalous use of the token.

## Headers, rate limiting, dependency hygiene — not yet implemented

The following are part of the intended security hardening pass but are **not currently in the
codebase**: CSP / `X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy` response
headers, Workers-native rate limiting on `/api/search` and `/api/admin/*`, and Dependabot/CodeQL
config. Do not assume any of these are active. This section should be rewritten (not just appended
to) once that work lands, describing what's actually deployed.

## Incident contact

The site's data controller / security contact is the account owner, `dursky.k@gmail.com`. There is
no separate on-call rotation or incident-response tooling — this is a single-operator project.

## Reporting a vulnerability

If you find a security issue in this codebase, open a private report (GitHub Security Advisories on
this repo) rather than a public issue, or contact `dursky.k@gmail.com` directly.
