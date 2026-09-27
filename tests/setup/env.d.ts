/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    // Injected only by vitest.config.ts's miniflare.bindings — not a real
    // app binding, so it lives here rather than in worker-configuration.d.ts.
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
