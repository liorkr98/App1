// ESLint 9 flat config.
//
// The rules below are the machine-enforced half of CLAUDE.md §4 and §5. RTL
// bugs are the #1 quality problem in this portfolio and they are invisible in
// an English simulator, so they are hard errors rather than warnings.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

/**
 * Style properties that hardcode a physical side (CLAUDE.md §4.1).
 *
 * Under RTL these do NOT flip — `marginLeft` is still the left edge when the
 * user reads right-to-left, so padding lands on the wrong side of every
 * component. The `*Start`/`*End` forms follow text direction instead.
 */
const BANNED_DIRECTIONAL_PROPERTIES = [
  // Exactly the list in CLAUDE.md §4.1.
  'marginLeft',
  'marginRight',
  'paddingLeft',
  'paddingRight',
  'left',
  'right',
  'borderLeftWidth',
  'borderRightWidth',
  // Same class of bug, same fix. Not named in §4.1 but they break identically.
  'borderLeftColor',
  'borderRightColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
];

const DIRECTIONAL_REPLACEMENTS = {
  marginLeft: 'marginStart',
  marginRight: 'marginEnd',
  paddingLeft: 'paddingStart',
  paddingRight: 'paddingEnd',
  left: 'start',
  right: 'end',
  borderLeftWidth: 'borderStartWidth',
  borderRightWidth: 'borderEndWidth',
  borderLeftColor: 'borderStartColor',
  borderRightColor: 'borderEndColor',
  borderTopLeftRadius: 'borderTopStartRadius',
  borderTopRightRadius: 'borderTopEndRadius',
  borderBottomLeftRadius: 'borderBottomStartRadius',
  borderBottomRightRadius: 'borderBottomEndRadius',
};

const bannedPattern = `^(${BANNED_DIRECTIONAL_PROPERTIES.join('|')})$`;
const replacementList = Object.entries(DIRECTIONAL_REPLACEMENTS)
  .map(([from, to]) => `${from} -> ${to}`)
  .join(', ');

const RTL_RESTRICTED_SYNTAX = [
  // --- §4.1 Directional properties -------------------------------------
  {
    // Covers both `{ marginLeft: 8 }` and `{ 'margin-left': 8 }` style keys.
    selector: `Property[key.name=/${bannedPattern}/], Property[key.value=/${bannedPattern}/]`,
    message: `CLAUDE.md §4.1: directional style properties do not flip under RTL. Use the start/end form instead (${replacementList}).`,
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
    ignores: ['node_modules/*', '.expo/*', 'dist/*', 'ios/*', 'android/*', 'coverage/*'],
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
    },
  },
  {
    // The two files that are allowed to do the thing the rules forbid, because
    // they are the shared implementation everything else calls.
    files: ['src/core/ui/rtl.ts', 'src/core/ui/Text.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
]);
