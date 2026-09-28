# PapaBlog

A personal tech blog — notes written down so I remember them, and so others
might find them useful. Live at [papablog.durski.dev](https://papablog.durski.dev).

Built with [Astro](https://astro.build), [React](https://react.dev) (admin
editor only), and [Tailwind CSS](https://tailwindcss.com), deployed on
[Cloudflare Workers](https://developers.cloudflare.com/workers/) with
[D1](https://developers.cloudflare.com/d1/) (SQLite) and
[R2](https://developers.cloudflare.com/r2/) (object storage).

## How this is put together

- **Public site** — server-rendered Astro pages reading directly from D1
  (posts, tags, search, RSS, sitemap); a few static pages (About, legal)
  are prerendered. D1 is the sole source of truth for post content — there
  is no git-backed content store.
- **Search** — a D1 [FTS5](https://sqlite.org/fts5.html) index (`/api/search`,
  `/search`) kept in sync with published posts; works with or without
  JavaScript.
- **Admin** (`/admin`) — gated by [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/)
  (email one-time-PIN login), not a custom auth system. A React-based editor
  autosaves a working draft to D1; clicking Publish snapshots that draft as
  the live post, instantly — no rebuild, no external commit.
- **Newsletter** — planned, not yet built.

See [`docs/architecture.md`](docs/architecture.md) for more, and
[`docs/prompts/`](docs/prompts/) for a running log of the AI-assisted
sessions that built this project.

## Local development

```sh
npm install
npm run dev        # http://localhost:4321
```

`/admin` works locally with no Cloudflare Access setup required — see
`.dev.vars.example`.

## Commands

| Command                     | Action                                                |
| :-------------------------- | :---------------------------------------------------- |
| `npm run dev`               | Start the local dev server                            |
| `npm run build`             | Production build to `./dist/`                         |
| `npm run preview`           | Preview the production build locally                  |
| `npm run typecheck`         | Type-check with `astro check`                         |
| `npm run lint` / `lint:fix` | Lint with ESLint                                      |
| `npm run format`            | Format with Prettier                                  |
| `npm run test`              | Run the test suite (Vitest, real D1/R2 via Miniflare) |

## Deploying

```sh
npm run build
npx wrangler deploy
```

Requires a Cloudflare account with a D1 database, R2 bucket, and KV
namespace already provisioned (see `wrangler.jsonc`). See
[`docs/deployment.md`](docs/deployment.md) for the full runbook.

## License

Source code is [MIT](LICENSE). Written post content is
[CC BY 4.0](LICENSE-CONTENT.md) — reusable, with attribution. See
[Terms of Service](https://papablog.durski.dev/legal/terms) for details.
