# Deployment Runbook

Manual, one-time setup steps for standing up PapaBlog on a fresh Cloudflare account/domain, plus the
ongoing deploy model. Actual deploys after this initial setup are automatic (see
[Ongoing deploys](#ongoing-deploys) below) — this document is mostly for disaster recovery or
standing up a second environment, not something you run on every change.

Current live deployment: `https://papablog.durski.dev`, Worker name `papablog`, account routes
configured in [`wrangler.jsonc`](../wrangler.jsonc).

## Prerequisites

- A Cloudflare account with the target domain's DNS already on Cloudflare (Access requires this —
  it cannot protect a path on `*.workers.dev`).
- A GitHub repository for the project (source of truth for published posts — see
  [architecture.md](./architecture.md)).
- Node.js ≥ 22.12 and `wrangler` (already a project dependency — use `npx wrangler`, not a global
  install, so the version always matches what's pinned in `package.json`).

## 1. Domain and Worker routing

The custom domain is declared directly in [`wrangler.jsonc`](../wrangler.jsonc):

```jsonc
"routes": [{ "pattern": "papablog.durski.dev", "custom_domain": true }],
"workers_dev": false,
```

`workers_dev: false` is deliberate and must stay — Access cannot protect the `*.workers.dev`
subdomain, so leaving it enabled would give `/admin` an unprotected back door.

For a new domain: add the domain to Cloudflare (if not already), update the `pattern` above and
`astro.config.mjs`'s `site` field to match, then a normal deploy (§7) provisions the custom domain
route.

## 2. D1 database

```bash
npx wrangler d1 create papablog-db
```

Copy the returned `database_id` into `wrangler.jsonc`'s `d1_databases[0].database_id`. Apply the
schema:

```bash
npx wrangler d1 migrations apply papablog-db --remote
```

See [database-schema.md](./database-schema.md) for the full schema and ongoing migration workflow.

## 3. R2 bucket

```bash
npx wrangler r2 bucket create papablog-media
```

Binding name `MEDIA`, bucket name `papablog-media` — already declared in `wrangler.jsonc`'s
`r2_buckets`. No further setup; the bucket is written to and read from entirely through the app's
own `/api/admin/drafts/[id]/media` (upload) and `/media/[...path]` (serve) routes, not the R2 public
bucket URL feature.

## 4. Cloudflare Zero Trust Access

This is the step that actually protects `/admin`. In the Cloudflare dashboard, under **Zero Trust →
Access → Applications**:

1. **Add an application** → Self-hosted.
2. **Domain**: the custom domain from step 1, path `/admin` — cover both `/admin*` and, separately,
   `/api/admin*` (either as two path rules on one application, or two applications; either works
   since the Worker's own middleware re-verifies independently regardless of which Access app
   matched).
3. **Identity provider**: enable **One-time PIN** (email OTP) — no need for a full IdP integration
   for a single-writer blog.
4. **Policy**: Allow, with an Include rule of type **Email** listing the writer's exact email
   address(es) (should match `ALLOWED_WRITER_EMAILS` below exactly — the two are independent checks,
   see [security.md](./security.md), and both should stay in sync).
5. **Session duration**: writer's preference (e.g. 24h) — this only controls how often the OTP
   challenge repeats, not the app's own JWT verification, which runs on every request regardless.
6. Save, then note two values from the application's **Overview** tab:
   - The **Application Audience (AUD) Tag** → this is `ACCESS_AUD`.
   - The team domain, shown as `<team-name>.cloudflareaccess.com` → this is `ACCESS_TEAM_DOMAIN`.

Set both as plain vars in `wrangler.jsonc` (`vars.ACCESS_TEAM_DOMAIN`, `vars.ACCESS_AUD`) — they are
not secret, just configuration, safe to commit.

## 5. GitHub PAT for the publish pipeline

The publish pipeline commits directly to this repo via GitHub's Contents API (see
[architecture.md](./architecture.md)), authenticated with a fine-grained PAT.

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new.
2. **Repository access**: Only select repositories → this one repo only.
3. **Permissions**: Repository → **Contents: Read and write**. Nothing else.
4. Generate, copy the token immediately (shown once).
5. Set it as a Worker secret (never a plain var — this grants write access to the repo):

```bash
npx wrangler secret put GITHUB_PAT
```

Also confirm `wrangler.jsonc`'s `vars.GITHUB_REPO_OWNER` / `vars.GITHUB_REPO_NAME` match the actual
repo. Without `GITHUB_PAT` set, every publish/unpublish attempt fails with a `502` from
`/api/admin/publish` — this is the one secret the app cannot run without.

Rotation procedure: see [security.md](./security.md#pat-rotation-procedure).

## 6. Remaining vars and secrets

Full list, cross-referenced with [security.md](./security.md#secrets-and-configuration):

```bash
# Plain vars — already in wrangler.jsonc, no action needed unless changing them
# ENVIRONMENT, ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_WRITER_EMAILS,
# GITHUB_REPO_OWNER, GITHUB_REPO_NAME

# Secret — required for the app to function at all
npx wrangler secret put GITHUB_PAT

# E2E_BYPASS_SECRET must NEVER be set in production — see security.md.
```

`ALLOWED_WRITER_EMAILS` is a comma-separated list, matched case-insensitively against the verified
Access JWT's email claim (see `src/lib/auth/allowlist.ts`) — update it in `wrangler.jsonc` and
redeploy if the set of writers ever changes, and keep the Access application's own policy (step 4)
in sync with it.

## 7. Deploying

```bash
npx wrangler deploy
```

This builds (`astro build`) and pushes the Worker + static assets in one step (Wrangler runs the
configured build via the `main` entrypoint pointing at Astro's Cloudflare adapter output). First
deploy also provisions the custom domain route and any declared-but-not-yet-created bindings (the KV
namespace for Astro's session API is pre-declared with a fixed `id` in `wrangler.jsonc` specifically
to avoid an auto-provisioning conflict on redeploy — see the comment there).

## Ongoing deploys

**Cloudflare Workers Builds** (git integration) is the actual continuous-deployment path — connect
the Worker to this GitHub repo in the dashboard (**Workers & Pages → papablog → Settings → Builds**),
pointing at the `main` branch with the default build command (`npx wrangler deploy` equivalent,
auto-detected for an Astro + Cloudflare-adapter project). Once connected, every push to `main` —
including the automated commits `/api/admin/publish` makes — triggers a rebuild and redeploy
automatically. There is no separate GitHub Actions deploy workflow; `npx wrangler deploy` from a
local machine (§7) is the manual/recovery path, not the normal one.

**Note**: this means every single published post triggers a full site rebuild+redeploy, not just an
incremental content update. For a blog at this scale that's an acceptable tradeoff for the
simplicity of "git push is the only deploy trigger" — worth reconsidering only if publish frequency
or build time ever become a real problem.

## Go-live smoke test checklist

After a fresh deploy (or whenever touching auth/publish config), verify manually:

- [ ] Public site loads at the custom domain; `workers.dev` preview URL is _not_ reachable (or, if
      reachable, does not expose `/admin` in a usable way — confirm `workers_dev: false` is in
      effect).
- [ ] Visiting `/admin` with no active Access session prompts an email OTP challenge.
- [ ] After OTP login, `/admin` loads and `/api/admin/whoami` returns the expected email.
- [ ] Logging in with a non-allow-listed email (if testable) is rejected — either by Access's own
      policy or, if it somehow gets through Access, by the app's `403` from `isAllowedWriter`.
- [ ] Create a draft, edit it, confirm autosave (status line updates to "Saved at ...").
- [ ] Publish it; confirm a real commit appears in the GitHub repo; wait for Workers Builds to
      finish; confirm the post is live at its slug URL and appears in `/`, `/tags`, `/rss.xml`, and
      `/api/search`.
- [ ] Unpublish it; confirm the commit sets `draft: true` and the post disappears from public
      listings after the rebuild.
- [ ] Trash an unpublished draft, confirm it disappears from `/admin` and appears in `/admin/trash`;
      restore it; confirm it's back.
- [ ] Upload a cover image; confirm it's reachable at its `/media/...` URL with a long-lived
      `Cache-Control` header.
