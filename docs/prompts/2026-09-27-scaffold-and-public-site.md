# Scaffold, Tooling, Public Site & Design

**Model:** Claude Sonnet 5
**Note:** Backfilled retroactively — see docs/prompts/README.md.

## Prompts

- Plan approved; proceed with implementation.
- "I also need some cool icon and logo" → iterated through a gradient-badge
  icon, then a hand-drawn "P + APA + BLOG" logotype based on a sketch the
  user drew and shared, then (after real-browser testing revealed a
  font-loading race bug) simplified back to a solid-fill badge.
- "the home page logo is ... ugly ... make it more simple like times new
  roman PapaBlog" → dropped the graphic logo entirely for a serif wordmark.
- "remove logo from main page", "make it modern like newspaper" → redesigned
  the whole site around a newspaper masthead aesthetic (serif headlines,
  rule lines, uppercase small-caps nav/bylines).
- "i also need light mode", "What is RSS in footer?", "Make header bigger",
  "Add docs to footer" → added a manual light/dark toggle (class-based
  Tailwind dark mode, localStorage-persisted), explained RSS, enlarged the
  masthead, clarified "docs" meant an About page.
- "1. about page 2. i need licence for the project 3. ... code can be
  reused but all text is mine and can be used but must be cited" → added
  MIT (code) + CC BY 4.0 (content) licensing, an About page, and a real
  Terms of Service / Privacy Policy (the latter accurately describing that
  the site collects no data yet).

## Summary

Scaffolded the project with `npm create astro`, then `astro add react
tailwind cloudflare`. Set up the full toolchain: TypeScript strict,
ESLint 10 (flat config, `@eslint-react` + `eslint-plugin-astro` +
`eslint-plugin-jsx-a11y-x`, chosen over older packages after hitting real
peer-dependency conflicts with the initial choices), Prettier, `lefthook`
git hooks, Vitest. Built the public site: content collections with a shared
Zod frontmatter schema, home/post/tag pages, RSS feed, sitemap. Iterated
several times on branding based on direct feedback, landing on a serif
"newspaper" aesthetic with a light/dark toggle. Added About/Terms/Privacy
pages with real MIT + CC BY 4.0 licensing. Verified every visual change in
an actual headless browser (Playwright), which caught real bugs along the
way (an SVG stroke/fill font-loading race condition, HTML whitespace
collapsing between inline elements).

## Commits

Not yet committed.
