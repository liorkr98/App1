import {
  Assistant_400Regular,
  Assistant_500Medium,
  Assistant_600SemiBold,
  Assistant_700Bold,
  useFonts,
} from '@expo-google-fonts/assistant';

/**
 * Hebrew typography (CLAUDE.md §5).
 *
 * Assistant is the default family for the whole portfolio. It is loaded
 * explicitly rather than falling back to the system font because Android's
 * default renders Hebrew badly — inconsistent weights and cramped diacritics.
 *
 * Only four weights are loaded. Hebrew has no italic form and no case, so
 * emphasis comes from weight and colour; shipping more weights than the design
 * system uses just costs bundle size.
 */

export const FONT_FAMILY = {
  regular: 'Assistant_400Regular',
  medium: 'Assistant_500Medium',
  semibold: 'Assistant_600SemiBold',
  bold: 'Assistant_700Bold',
} as const;

export type FontWeightName = keyof typeof FONT_FAMILY;

/**
 * Minimum line-height multiplier for Hebrew (CLAUDE.md §5).
 *
 * Hebrew letters have no ascenders or descenders, so the Latin habit of tight
 * leading makes a Hebrew paragraph look like a solid block. 1.5x is the floor,
 * not a suggestion.
 */
export const HEBREW_LINE_HEIGHT_RATIO = 1.5;

/** Converts a font size to the line height Hebrew needs. */
export function hebrewLineHeight(fontSize: number): number {
  return Math.round(fontSize * HEBREW_LINE_HEIGHT_RATIO);
}

/**
 * Loads the Assistant family.
 *
 * @returns `[loaded, error]` — render nothing until one of them is truthy, or
 * the first frame shows the system font and then visibly reflows.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    Assistant_400Regular,
    Assistant_500Medium,
    Assistant_600SemiBold,
    Assistant_700Bold,
  });
}
