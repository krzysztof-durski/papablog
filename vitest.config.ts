import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

  return {
    test: {
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
      setupFiles: ['./tests/setup/apply-migrations.ts'],
    },
    plugins: [
      cloudflareTest({
        main: './tests/setup/test-worker.ts',
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Test-only binding so the setup file can apply migrations before
          // any test runs — not part of the real app's bindings.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  };
});
