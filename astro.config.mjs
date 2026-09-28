// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://papablog.durski.dev',

  // Server output: static pages (about, legal, etc.) opt into prerendering
  // per-page (export const prerender = true); everything reading from D1 —
  // posts, tags, search, /admin, /api — renders on the Worker at request
  // time instead, since D1 is the source of truth for that content.
  output: 'server',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});
