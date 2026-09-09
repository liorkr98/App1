/**
 * Photo ordering for the editor, and the RTL trap that comes with it.
 *
 * THE RULE (CLAUDE.md §4.4):
 *
 *   In RTL the FIRST item is the RIGHTMOST. Index 0 is on the right.
 *
 * The seller drags photos into the order they want. Index 0 becomes the cover
 * — the single image the WhatsApp card is cut from — so getting this wrong
 * does not produce a subtly odd gallery. It publishes the wrong cover photo,
 * and the seller finds out after the link has been sent to thirty people.
 *
 * WHERE IT ACTUALLY GOES WRONG
 *
 * Not in the array. A plain `splice` reorder is direction-agnostic and always
 * correct — the model order is the publication order, full stop.
 *
 * It goes wrong at the BOUNDARY, converting a pointer position into an index.
 * The obvious formula is
 *
 *     index = floor(x / itemWidth)
 *
 * which counts from the left edge. Under `direction: rtl` the flow is
 * reversed, so the item at x = 0 is the LAST one, not the first. Every model
 * writes the LTR formula, it looks right in an English test, and it silently
 * reverses the gallery for every Hebrew seller.
 *
 * So the conversion is the thing that is isolated here, and the thing the
 * tests hammer.
 */

export type Direction = 'rtl' | 'ltr';

/**
 * Moves one item, returning a new array.
 *
 * Direction-agnostic on purpose: by the time we are here, both indices are
 * model indices. Anything direction-dependent has already happened in
 * `indexFromPointer`.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];

  // Clamped rather than rejected: a drag past the end of the strip is a
  // perfectly ordinary gesture meaning "put it last".
  const target = Math.max(0, Math.min(to, next.length));
  next.splice(target, 0, moved);

  return next;
}

/**
 * Converts a pointer x-position into a MODEL index.
 *
 * This is the whole point of the file. Under RTL the visual order runs right
 * to left, so the leftmost slot holds the LAST item.
 *
 * `x` is relative to the container's own left edge — as `clientX - rect.left`
 * gives it — in both directions. It is deliberately not "distance from the
 * start edge", because every browser API reports from the left and converting
 * at the call site is where the bug reappears.
 */
export function indexFromPointer(
  x: number,
  containerWidth: number,
  count: number,
  direction: Direction,
): number {
  if (count <= 0) return 0;
  if (containerWidth <= 0) return 0;

  const slot = containerWidth / count;
  const fromLeft = Math.floor(x / slot);
  const clamped = Math.max(0, Math.min(fromLeft, count - 1));

  // The one line that matters.
  return direction === 'rtl' ? count - 1 - clamped : clamped;
}

/**
 * The order that gets published: model order, unchanged.
 *
 * Exists as a named function rather than an implicit assumption so that the
 * test can assert on the thing the seller actually receives, and so nobody
 * later "fixes" the RTL gallery by reversing the array before saving — which
 * would flip the cover photo while making the editor look correct.
 */
export function publishedOrder<T>(items: readonly T[]): T[] {
  return [...items];
}

/** Index 0. Named, because "the cover" is a product concept, not `items[0]`. */
export function coverOf<T>(items: readonly T[]): T | undefined {
  return items[0];
}
