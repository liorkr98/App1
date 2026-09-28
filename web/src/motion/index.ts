/**
 * The motion module's one entry point.
 *
 * CSS does almost everything (motion.css). This wires the two primitives
 * that need a script — the letter cascade (M2) and the counters (M8) — and
 * nothing else, so a template that imports it pays for a few hundred bytes.
 */
import { observeCounts } from './counter';
import { splitLetters } from './split';

export { countUp, observeCounts } from './counter';
export { splitLetters } from './split';

export function initMotion(root: ParentNode = document): () => void {
  root.querySelectorAll<HTMLElement>('[data-ls-letters]').forEach(splitLetters);
  return observeCounts(root);
}
