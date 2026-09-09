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
const tsParser = require('@typescript-eslint/parser');

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
    // Everything TypeScript that is not ignored above — which is src/ plus
    // app.config.ts at the root. app.config.ts matches no other block, and
    // eslint-config-prettier applies universally, so without a parser here it
    // would be linted by espree and fail exactly like src/ did.
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // ESLint's default parser is espree, which does not understand a type
      // annotation — it fails on the first `: string` in the file. The old
      // config got a TypeScript parser transitively from eslint-config-expo;
      // removing that package removed the parser with it, and four commits
      // went in before CI said so.
      //
      // Parser only, not the typescript-eslint rule sets. The rules below are
      // core ESLint ones that work fine on a TypeScript AST, and type-aware
      // linting would mean a second full typecheck on every run for rules we
      // have not asked for.
      parser: tsParser,
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
