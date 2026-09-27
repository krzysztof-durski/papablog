# Project Planning

**Model:** Claude Sonnet 5
**Note:** Backfilled retroactively — see docs/prompts/README.md.

## Prompts

- "I want to start my personal tech blog 'PapaBlog'... I need this idea to be
  well documented as a professional technical writer, I need test as
  professional automated software tester, follow clean code principles, have
  good safe database and follow cyber security guidelines... I need tech
  stack to deploy it on cloudflare, preferably with D1 db and maybe bucket
  and I need some smart way for logging in as writer. I need proper space for
  ToS and Privacy Policy and not [violate] EU rules etc. Page must be
  responsive."
- Follow-up answers across several rounds of clarifying questions, settling:
  hybrid content authoring (admin UI + git as source of truth), Cloudflare
  Zero Trust Access for the writer login, Astro + TypeScript, React for the
  admin editor only, Tailwind, RSS + D1 FTS5 search + newsletter (manual send
  for v1) as launch features, and confirmation of an owned domain
  (papablog.durski.dev).
- Explicit rejection of Neo.mjs as the framework (wrong tool for a
  content/SEO-first site) in favor of Astro.

## Summary

Produced a full architecture plan (data model, API routes, auth design,
publish pipeline design, testing strategy, security checklist, documentation
structure, legal pages plan, and a phased build order) via an Explore pass
(confirmed the repo was genuinely empty) and a dedicated Plan agent. The plan
became the working spec for every build phase that followed.

## Commits

Not yet committed.
