# First Deployment & Cloudflare Access

**Model:** Claude Sonnet 5
**Note:** Backfilled retroactively — see docs/prompts/README.md.

## Prompts

- "i need to deploy to set up zero trust"
- Shared the real Access Application Audience (AUD) tag and Zero Trust team
  domain once created in the Cloudflare dashboard.
- Screenshots of the Access application's Destinations tab, used to diagnose
  why `/admin` wasn't actually being intercepted by Access (only
  `/api/admin` had been configured as a destination — `/admin*` was added).
- "is /admin accessible now?" / "is /admin accessible in local dev without
  verification?" (answered: no — confirmed 403 with zero headers).
- "i need it to work in dev too without zero trust needed" → redesigned the
  local bypass so a plain browser request with no special headers just logs
  the developer in, while an explicit-identity path (secret + email headers)
  remains available for tests that need to simulate a specific identity.

## Summary

First real deployment: authenticated wrangler (already logged in), created
the production D1 database and R2 bucket, discovered and fixed a real
Wrangler gotcha (named environments don't inherit top-level bindings — a
`d1_databases` array declared outside an `env` block silently doesn't apply
under `--env production`), flattened the config to a single environment,
and deployed. Built the actual Access-JWT verification middleware (`jose`,
JWKS fetched from the team domain, issuer/audience/expiry validated,
independent allow-list re-check as defense-in-depth). Diagnosed a real
misconfiguration live against the production site (Access wasn't
intercepting `/admin` because that path wasn't listed as a destination on
the Access application) by comparing response headers/bodies between a
real Access denial and the Worker's own fallback 403. Verified the full
login loop end-to-end.

## Commits

Not yet committed.
