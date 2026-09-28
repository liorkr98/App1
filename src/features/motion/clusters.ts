/**
 * Splits a Hebrew (or any) word into "base letter + its marks".
 *
 * Niqqud and cantillation (U+0591–05C7) and geresh/gershayim (U+05F3,
 * U+05F4) belong to the letter before them. Giving a mark its own animated
 * span renders it on a dotted circle, detached from its letter — so the
 * letter cascade (web/src/motion/split.ts) splits by these clusters, not by
 * code point. Pure, so it is tested here rather than in a browser.
 */
const MARK = /[֑-ׇ׳״]/;

export function clusters(word: string): string[] {
  const out: string[] = [];
  for (const ch of word) {
    if (MARK.test(ch) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
