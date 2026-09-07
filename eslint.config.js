// ESLint 9 flat config.
//
// Stage 1 adds the RTL rules required by CLAUDE.md §4.1 and §4.2 (banned
// directional style properties, and the row-reverse double-flip antipattern).
// Until then this is the Expo baseline plus Prettier conflict removal.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/*', '.expo/*', 'dist/*', 'ios/*', 'android/*', 'coverage/*'],
  },
]);
