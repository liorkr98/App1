// ESLint 9 flat config.
//
// Scope is the SHARED DOMAIN — src/types and src/features — plus the Node
// scripts. web/ and worker/ are linted by their own toolchains.
//
// The React Native RTL rules that used to live here are gone with the app
// (tag react-native-v1). They policed style objects — marginLeft, I18nManager
// ternaries — and there are no style objects left to police. The web half of
// that job is `scripts/verify-web-logical-props.mjs`, which fails the build on
// physical left/right in CSS and is itself proved to fire on every CI run by
// `scripts/verify-web-lint-fires.sh`.
//
// Deleting a rule because its subject matter went away is correct. Keeping a
// rule that can no longer match anything is worse than having none: it reads
// as coverage and provides nothing.
const { defineConfig } = require('eslint/config');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      // Each has its own config, libs and lint pass.
      'web/**',
      'worker/**',
      'ingest/**',
      // Deno.
      'supabase/functions/**',
    ],
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Hebrew display strings live in the schema files by design — they are
      // the authoritative label, not a translation key (PRD.md §2). So there
      // is no no-literal-string rule here, deliberately.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'error',
    },
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      // These scripts exist to print findings and fail the build.
      'no-console': 'off',
    },
  },

  prettierConfig,
]);
