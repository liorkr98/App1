// ESLint 9 flat config.
//
// The rules below are the machine-enforced half of CLAUDE.md §4 and §5. RTL
// bugs are the #1 quality problem in this portfolio and they are invisible in
// an English simulator, so they are hard errors rather than warnings.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

/**
 * Style properties that hardcode a physical side, and what to use instead
 * (CLAUDE.md §4.1).
 *
 * Under RTL these do NOT flip — `marginLeft` is still the left edge when the
 * user reads right-to-left, so padding lands on the wrong side of every
 * component. The `*Start`/`*End` forms follow text direction instead.
 *
 * Deliberately a list of pairs rather than an object: object keys named
 * `marginLeft` would be Property nodes, and the rule below would flag its own
 * configuration.
 */
const DIRECTIONAL_REPLACEMENTS = [
  // Exactly the list in CLAUDE.md §4.1.
  ['marginLeft', 'marginStart'],
  ['marginRight', 'marginEnd'],
  ['paddingLeft', 'paddingStart'],
  ['paddingRight', 'paddingEnd'],
  ['left', 'start'],
  ['right', 'end'],
  ['borderLeftWidth', 'borderStartWidth'],
  ['borderRightWidth', 'borderEndWidth'],
  // Same class of bug, same fix. Not named in §4.1 but they break identically.
  ['borderLeftColor', 'borderStartColor'],
  ['borderRightColor', 'borderEndColor'],
  ['borderTopLeftRadius', 'borderTopStartRadius'],
  ['borderTopRightRadius', 'borderTopEndRadius'],
  ['borderBottomLeftRadius', 'borderBottomStartRadius'],
  ['borderBottomRightRadius', 'borderBottomEndRadius'],
];

const bannedPattern = `^(${DIRECTIONAL_REPLACEMENTS.map(([from]) => from).join('|')})$`;

const RTL_RESTRICTED_SYNTAX = [
  // --- §4.1 Directional properties -------------------------------------
  {
    // Covers both `{ marginLeft: 8 }` and `{ 'margin-left': 8 }` style keys.
    selector: `Property[key.name=/${bannedPattern}/], Property[key.value=/${bannedPattern}/]`,
    message:
      'CLAUDE.md §4.1: this style property hardcodes a physical side and does not flip under RTL. Use the start/end form: marginLeft/Right -> marginStart/End, paddingLeft/Right -> paddingStart/End, left/right -> start/end, border*Left/Right* -> border*Start/End*.',
  },
  {
    selector: "Property[key.name='textAlign'] > Literal[value=/^(left|right)$/]",
    message:
      "CLAUDE.md §4.1: textAlign 'left'/'right' pins text to a physical side. Use 'auto' (or omit it) so alignment follows text direction.",
  },

  // --- §4.2 The row-reverse double-flip --------------------------------
  {
    selector: "ConditionalExpression:has(MemberExpression[property.name='isRTL'])",
    message:
      "CLAUDE.md §4.2: do not branch layout on I18nManager.isRTL. flexDirection 'row' already flips under RTL, so a ternary double-flips it. Use plain 'row'. The only sanctioned exception is flipForRTL() in src/core/ui/rtl.ts.",
  },

  // --- §5 Hebrew typography --------------------------------------------
  {
    selector: "Property[key.name='textTransform'] > Literal[value='uppercase']",
    message:
      'CLAUDE.md §5: Hebrew has no case, so uppercase does nothing to Hebrew and shouts in English. Use weight or colour for emphasis.',
  },
  {
    selector: "Property[key.name='fontStyle'] > Literal[value='italic']",
    message:
      'CLAUDE.md §5: Hebrew has no italic form; synthetic italics look broken. Use weight or colour for emphasis.',
  },
];

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/*',
      '.expo/*',
      'dist/*',
      'ios/*',
      'android/*',
      'coverage/*',
      // Deno runtime, different globals and module resolution.
      'supabase/functions/*',
      // Astro workspace: its own toolchain, and physical left/right there is
      // caught by scripts/verify-web-logical-props.mjs instead.
      'web/*',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...RTL_RESTRICTED_SYNTAX],
      // CLAUDE.md §10: bare react-native Text carries no font, line height or
      // direction defaults, so Hebrew renders in the system font.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message:
                'CLAUDE.md §5/§10: import Text from @/core/ui/Text, which carries the Hebrew font and line-height defaults.',
            },
          ],
        },
      ],
      // i18next has both a default export and named exports with the same
      // names, so `i18next.use(...)` trips this rule. The chained form is the
      // documented i18next API, so the rule is the thing that is wrong here.
      'import/no-named-as-default-member': 'off',
    },
  },
  {
    // The files that are allowed to do the thing the rules forbid, because
    // they are the shared implementation everything else calls.
    files: ['src/core/ui/rtl.ts', 'src/core/ui/Text.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
]);
