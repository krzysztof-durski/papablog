// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astroPlugin from 'eslint-plugin-astro';
import reactPlugin from '@eslint-react/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y-x';
import globals from 'globals';

export default defineConfig(
  globalIgnores(['dist/**', '.astro/**', 'node_modules/**', '.wrangler/**', 'worker-configuration.d.ts', '.tmp-*']),

  js.configs.recommended,

  // Type-aware linting for all TypeScript, including .astro frontmatter
  // (eslint-plugin-astro type-checks it against the same tsconfig project).
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
  },

  astroPlugin.configs['flat/recommended'],
  astroPlugin.configs['flat/jsx-a11y-recommended'],
  {
    files: ['**/*.astro'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Astro frontmatter is type-checked, but the strict-type-checked
      // preset is tuned for application code and is noisier than useful
      // against simple template glue.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // eslint-plugin-astro's synthetic AST for a frontmatter-level `return`
      // crashes this rule outright ("Expected node to have a parent"), not
      // just false-positives — astro-eslint-parser / typescript-eslint
      // interaction bug, not a real risk in frontmatter (there are no
      // promise-returning callback contexts here to misuse).
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // React admin island only — kept out of the public site's lint surface
  // to mirror the runtime boundary (React never ships outside /admin).
  {
    files: ['src/components/admin/**/*.{ts,tsx}'],
    plugins: {
      '@eslint-react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y-x': jsxA11yPlugin,
    },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactPlugin.configs['recommended-typescript'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
    },
  },

  {
    files: ['**/*.config.{js,mjs,ts}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },

  // eslint-plugin-astro extracts each inline `<script>` block (e.g. from
  // ThemeToggle.astro) into a virtual file like `Foo.astro/1_1.ts` for
  // linting — these are plain browser snippets outside the tsconfig
  // project, so type-aware rules don't apply to them.
  {
    files: ['**/*.astro/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // eslint.config.js itself is intentionally outside the app's tsconfig
  // project (see tsconfig.json exclude) so tooling config doesn't get
  // caught up in the same strict app-code type checking astro check runs.
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
