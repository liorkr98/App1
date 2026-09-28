/**
 * M2 · letter cascade.
 *
 * Splits the text of an element into one span per letter so CSS can stagger
 * them. Hebrew letters do not join, so splitting is safe for the glyphs —
 * but three things are not, and this handles each:
 *
 *   1. A LINE MUST NEVER WRAP INSIDE A WORD. Each word becomes one
 *      unbreakable .ls-word box holding its letters; the spaces between
 *      words stay real spaces, so the browser still wraps between them.
 *   2. MARKS STAY WITH THEIR LETTER. Niqqud and cantillation (U+0591–05C7)
 *      and geresh/gershayim ride on the preceding base letter rather than
 *      getting a span of their own, or they would render on a dotted circle.
 *   3. A SCREEN READER HEARS THE WORDS, not a letter-by-letter spelling: the
 *      element gets the original text as aria-label and the spans are
 *      aria-hidden.
 *
 * The stagger index runs in document order, which in a right-to-left
 * paragraph is right to left — the reading order, with no extra work.
 *
 * Idempotent: an element already split is left alone.
 */

import { clusters } from '@/features/motion/clusters';

export function splitLetters(el: HTMLElement): void {
  if (el.dataset.lsSplit === '1') return;
  const text = el.textContent ?? '';
  let i = 0;
  const words = text.split(/(\s+)/);
  const frag = document.createDocumentFragment();
  for (const part of words) {
    if (part === '') continue;
    if (/^\s+$/.test(part)) {
      frag.append(document.createTextNode(' '));
      continue;
    }
    const word = document.createElement('span');
    word.className = 'ls-word';
    for (const c of clusters(part)) {
      const letter = document.createElement('span');
      letter.className = 'ls-letter';
      letter.style.setProperty('--i', String(i++));
      letter.textContent = c;
      word.append(letter);
    }
    frag.append(word);
  }
  el.setAttribute('aria-label', text.trim());
  const holder = document.createElement('span');
  holder.setAttribute('aria-hidden', 'true');
  holder.append(frag);
  el.replaceChildren(holder);
  el.dataset.lsSplit = '1';
}
