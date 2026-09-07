/**
 * Design tokens — the single source for spacing, radius, colour and type
 * (CLAUDE.md §5).
 *
 * No hardcoded hex value may appear anywhere else in the codebase. If a
 * component needs a colour that is not here, the colour is missing from the
 * system, not from the component.
 */

import { HEBREW_LINE_HEIGHT_RATIO } from './fonts';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Minimum touch target, in points.
 *
 * Apple's HIG and Android's accessibility guidance both land here. Anything
 * smaller fails review and fails users with less precise motor control.
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Type scale.
 *
 * Every line height is at least 1.5x the font size (CLAUDE.md §5): Hebrew has
 * no ascenders or descenders, so Latin-tight leading makes a paragraph look
 * like a solid block.
 *
 * No italic and no uppercase variants exist on purpose — Hebrew has neither an
 * italic form nor letter case.
 */
const scale = (fontSize: number) => Math.round(fontSize * HEBREW_LINE_HEIGHT_RATIO);

export const typeScale = {
  display: { fontSize: 32, lineHeight: scale(32) },
  title: { fontSize: 22, lineHeight: scale(22) },
  body: { fontSize: 16, lineHeight: scale(16) },
  label: { fontSize: 14, lineHeight: scale(14) },
  caption: { fontSize: 13, lineHeight: scale(13) },
} as const;

export type TypeVariant = keyof typeof typeScale;

/**
 * Colour palettes.
 *
 * Both schemes carry the same keys so a component never has to ask which one
 * it is in. Contrast ratios for text on background meet WCAG AA.
 */
export type ColorScheme = 'light' | 'dark';

/**
 * Every colour the system has. Both schemes must implement all of it, so a
 * component never has to ask which scheme it is in — or guard a missing key.
 */
export interface Colors {
  background: string;
  backgroundElevated: string;
  backgroundSunken: string;
  overlay: string;

  text: string;
  textSecondary: string;
  textInverse: string;
  textDisabled: string;

  border: string;
  borderStrong: string;

  primary: string;
  primaryPressed: string;
  primaryDisabled: string;

  danger: string;
  dangerPressed: string;
  dangerDisabled: string;

  success: string;
  warning: string;
}

const palette: Record<ColorScheme, Colors> = {
  light: {
    background: '#FFFFFF',
    backgroundElevated: '#F5F6F8',
    backgroundSunken: '#EEF0F3',
    overlay: 'rgba(17, 20, 24, 0.45)',

    text: '#111418',
    textSecondary: '#5A6270',
    textInverse: '#FFFFFF',
    textDisabled: '#9AA2AF',

    border: '#DDE1E7',
    borderStrong: '#C2C8D2',

    primary: '#1F6FEB',
    primaryPressed: '#1A5FCC',
    primaryDisabled: '#A9C6F7',

    danger: '#D42F2F',
    dangerPressed: '#B32424',
    dangerDisabled: '#EDACAC',

    success: '#1E8E4E',
    warning: '#B7791F',
  },
  dark: {
    background: '#101317',
    backgroundElevated: '#181C22',
    backgroundSunken: '#0A0D10',
    overlay: 'rgba(0, 0, 0, 0.6)',

    text: '#F2F4F7',
    textSecondary: '#A2ABB8',
    textInverse: '#101317',
    textDisabled: '#6B7480',

    border: '#2A3038',
    borderStrong: '#3B434E',

    primary: '#4D93FF',
    primaryPressed: '#3B7FE6',
    primaryDisabled: '#2C4A75',

    danger: '#FF6B6B',
    dangerPressed: '#E45555',
    dangerDisabled: '#6B3535',

    success: '#4ADE80',
    warning: '#F0B429',
  },
};

export function colorsFor(scheme: ColorScheme): Colors {
  return palette[scheme];
}

export const tokens = {
  spacing,
  radius,
  typeScale,
  MIN_TOUCH_TARGET,
} as const;
