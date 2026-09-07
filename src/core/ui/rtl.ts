import { I18nManager, type ViewStyle } from 'react-native';

/**
 * Mirrors an icon horizontally when the layout is right-to-left
 * (CLAUDE.md §4.3).
 *
 * Apply this ONLY to icons that express direction or progress: back and
 * forward chevrons, arrows, undo/redo, indent, send, next/previous, progress
 * indicators, trend lines that imply a timeline.
 *
 * Do NOT apply it to icons that depict a real object or a universal symbol:
 * logos, play/pause, clocks, checkmarks, X, the search magnifier, hamburger,
 * settings gear, camera, trash, heart, star, numerals, phone. A mirrored
 * camera is just a broken camera.
 *
 * The test: does the icon depict a real object? Then it does not flip.
 *
 * @example
 * <ChevronIcon style={flipForRTL()} />
 */
export function flipForRTL(): ViewStyle {
  // This file is exempted from the no-restricted-syntax RTL rules in
  // eslint.config.js: it is the one sanctioned place to branch on isRTL.
  return { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] };
}
