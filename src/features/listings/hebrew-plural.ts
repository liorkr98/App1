/**
 * Hebrew count agreement: one / two / other.
 *
 * i18next plural categories, applied by hand because this page has no i18n
 * runtime and the listing script budget is 12 KB. "1 דקות" is the bug —
 * Hebrew does not form the plural that way.
 *
 * The digit stays out of the one/two forms (דקה אחת, שתי דקות) and is
 * interpolated only for other, where the caller wraps it in <bdi>.
 */

export interface HebrewCountForms {
  /** The whole phrase for 1. No digit. */
  one: string;
  /** The whole phrase for 2. No digit. */
  two: string;
  /** The noun that follows the digit for 3+. */
  other: string;
}

export function hebrewCount(count: number, forms: HebrewCountForms): string {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  return `${count} ${forms.other}`;
}

export const MINUTE_FORMS: HebrewCountForms = {
  one: 'דקה אחת',
  two: 'שתי דקות',
  other: 'דקות',
};

export const ROOM_FORMS: HebrewCountForms = {
  one: 'חדר אחד',
  two: 'שני חדרים',
  other: 'חדרים',
};

export const FLOOR_FORMS: HebrewCountForms = {
  one: 'קומה אחת',
  two: 'שתי קומות',
  other: 'קומות',
};

export const PHOTO_FORMS: HebrewCountForms = {
  one: 'תמונה אחת',
  two: 'שתי תמונות',
  other: 'תמונות',
};

/** "דקה אחת" / "שתי דקות" / "3 דקות" — the walking-time noun, without הליכה. */
export function minutePhrase(count: number): string {
  return hebrewCount(count, MINUTE_FORMS);
}

/** Walking time as one phrase: דקה אחת הליכה, שתי דקות הליכה, 7 דקות הליכה. */
export function walkPhrase(count: number): string {
  return `${minutePhrase(count)} הליכה`;
}

/**
 * How a walking-time numeral is painted.
 *
 * one/two are words (there is no digit to isolate). other keeps the digit
 * separate so the page can wrap it in <bdi> and set it in the serif.
 */
export function walkMinuteParts(count: number): { words: string } | { digit: number; noun: string } {
  if (count === 1 || count === 2) return { words: minutePhrase(count) };
  return { digit: count, noun: MINUTE_FORMS.other };
}

/** The same split, with הליכה on the phrase. */
export function walkingLineParts(
  count: number,
): { words: string } | { digit: number; noun: string } {
  if (count === 1 || count === 2) return { words: walkPhrase(count) };
  return { digit: count, noun: `${MINUTE_FORMS.other} הליכה` };
}

export function roomPhrase(count: number): string {
  return hebrewCount(count, ROOM_FORMS);
}

export function floorPhrase(count: number): string {
  return hebrewCount(count, FLOOR_FORMS);
}

export function photoPhrase(count: number): string {
  return hebrewCount(count, PHOTO_FORMS);
}
