/**
 * Formatting for the web page.
 *
 * DELIBERATELY NOT the mobile app's src/core/i18n/format.ts. That module pins
 * direction with U+200E because React Native has no bidi element. HTML does:
 * <bdi> is the correct tool, it is what the reference pages use, and mixing
 * both would double-wrap every number.
 *
 * These functions return plain strings. Components wrap them in <bdi>.
 */

/** Groups digits: 1850000 -> "1,850,000". */
export function num(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 1850000 -> "₪1,850,000". Sign first, matching the reference pages. */
export function ils(value: number): string {
  return `₪${num(value)}`;
}

/** dd/MM/yyyy. Built by hand so output does not vary with platform ICU. */
export function heDate(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** MM/yyyy, for a vehicle test date. */
export function heMonthYear(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${month}/${date.getUTCFullYear()}`;
}

/**
 * Renders a fact value for display, without its unit.
 *
 * Booleans are יש / אין and never a tick or a cross — a tick reads as
 * "verified" rather than "present", and a cross reads as a failure.
 */
export function factValue(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'יש' : 'אין';
  if (typeof value === 'number') return num(value);
  return value;
}

/** True when a value should be wrapped in <bdi> — numbers and numeric strings. */
export function needsBdi(value: string | number | boolean | null): boolean {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  // Any Latin digit at all is enough to need direction pinning: a date, a
  // ratio, a phone number, a year, a measurement.
  return /\d/.test(value);
}

export interface Segment {
  text: string;
  bdi: boolean;
}

/**
 * Splits Hebrew prose into segments, marking the runs that must be wrapped in
 * <bdi>.
 *
 * Two kinds of run break bidi inside a right-to-left sentence:
 *
 *   Digit runs   "054-1234567" renders as "1234567-054" without pinning,
 *                because the hyphen is direction-neutral and the algorithm
 *                treats the two digit groups as separate runs. Same for
 *                "3 / 5" flipping to "5 / 3" and "03/2027" to "2027/03".
 *
 *   Latin runs   "Apple CarPlay" drifts to the wrong side of the surrounding
 *                punctuation, so the sentence reads with the English phrase
 *                in the wrong place.
 *
 * Returning segments rather than an HTML string keeps this free of
 * set:html — the caller renders real <bdi> elements and the text stays
 * escaped.
 */
const BIDI_RUN =
  /(₪?\d[\d.,:/–—-]*\d|₪?\d+|[A-Za-z][A-Za-z0-9.'&+-]*(?:\s+[A-Za-z][A-Za-z0-9.'&+-]*)*)/g;

export function splitBdi(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(BIDI_RUN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), bdi: false });
    }
    segments.push({ text: match[0], bdi: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bdi: false });
  }

  return segments;
}
