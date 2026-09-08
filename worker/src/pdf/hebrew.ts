/**
 * Hebrew detection for the PDF check (D5).
 *
 * Split out from verify.ts so it carries no dependencies: verify.ts pulls in
 * pdfjs, and the interesting logic here — what counts as Hebrew, and why the
 * sentinel is matched in both directions — is worth testing without loading a
 * PDF engine to do it.
 */

/**
 * Present on every listing page regardless of category, because the WhatsApp
 * CTA is what the whole product is built around.
 *
 * Copied byte for byte from web/src/components/CtaDock.astro. If that string
 * is ever edited this check starts failing, which is the correct outcome and
 * not a bug: the sentinel needs updating in the same commit.
 */
export const HEBREW_SENTINEL = 'שליחת הודעה בוואטסאפ';

/** Hebrew block, plus the presentation forms some producers emit instead. */
const HEBREW_LETTERS = /[\u0590-\u05FF\uFB1D-\uFB4F]/u;

/**
 * Bidi controls and zero-width marks, written as escapes on purpose.
 *
 * Spelling these out as literal characters would put invisible codepoints in
 * the source, where the next person to touch this file cannot see them and an
 * editor may silently normalise them away.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

export function normalise(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
}

const reverse = (text: string): string => [...text].reverse().join('');

export function containsHebrew(text: string): boolean {
  return HEBREW_LETTERS.test(text);
}

/**
 * True when the sentinel is present in either direction.
 *
 * Extraction order for RTL is not guaranteed. A PDF stores positioned glyph
 * runs, not a paragraph, and different producers emit Hebrew in logical or in
 * visual order — so a strict forward match would reject a perfectly good file
 * about half the time. Both directions prove the same thing here: the glyphs
 * mapped back to Hebrew codepoints, so the font is embedded.
 */
export function containsSentinel(text: string, sentinel: string = HEBREW_SENTINEL): boolean {
  const haystack = normalise(text);
  const needle = normalise(sentinel);

  if (needle.length === 0) return false;

  return haystack.includes(needle) || haystack.includes(reverse(needle));
}
