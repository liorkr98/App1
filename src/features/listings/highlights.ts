/**
 * Highlight chips on the listing first screen.
 *
 * Chosen by the agent from this list, plus one custom string. Max three.
 * Copied onto the listing row at publish so the page never reads the profile.
 */

export const HIGHLIGHT_LABELS = [
  'ממ״ד',
  'מרפסת שמש',
  'חניה',
  'מעלית',
  'משופצת',
  'נוף פתוח',
  'דירת גן',
  'פנטהאוז',
  'קומה גבוהה',
  'כניסה מיידית',
  'מחסן',
  'מיזוג מרכזי',
] as const;

export type HighlightLabel = (typeof HIGHLIGHT_LABELS)[number];

const MAX_HIGHLIGHTS = 3;

export function listingHighlights(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length === MAX_HIGHLIGHTS) break;
  }
  return out;
}
