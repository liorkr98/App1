/**
 * The accent colours an agent may choose.
 *
 * WHY THIS EXISTS. The templates shipped with the agency one accented orange
 * and the other two olive, which gave the product two brand colours depending
 * on which template a listing happened to use. That is not a palette, it is an
 * inconsistency. Orange is gone; every template is olive by default, and the
 * accent is now something the AGENT picks once, on /me, and carries across all
 * three templates and every listing they make.
 *
 * It is the same argument as the agency name: an agent's pages should look
 * like each other, and the way to guarantee that is to ask once rather than
 * per listing.
 *
 * NOT BLUE, ANY OF THEM. CLAUDE.md §2: every Israeli property brand is blue,
 * and the point of the original olive was to not be. Offering blue back as an
 * option would hand that away one agent at a time.
 *
 * TWO STOPS PER ACCENT, and both are needed.
 *
 *   base  fills a button and prints on the light ground. Plaster type sits on
 *         it, so it has to be dark enough for 4.5:1.
 *   lift  the same hue carried up, for type ON a dark ground — the enrichment
 *         block, the dark template. `base` is too close in value to --ink-deep
 *         to read there, which is the whole reason --olive-lift existed.
 *
 * Every pair below was measured rather than judged. See accents.test.ts, which
 * asserts the contrast rather than trusting this comment.
 */
export interface Accent {
  id: string;
  /** Button fill and accent on a light ground. */
  base: string;
  /** The same hue, for type on a dark ground. */
  lift: string;
}

export const ACCENTS = [
  { id: 'olive', base: '#4a5d3a', lift: '#7e9a62' },
  { id: 'forest', base: '#2f5340', lift: '#6e9b80' },
  { id: 'clay', base: '#8c4a2f', lift: '#c17a55' },
  { id: 'wine', base: '#6e2639', lift: '#b06b80' },
  { id: 'ochre', base: '#8a6a1f', lift: '#c7a24e' },
  { id: 'charcoal', base: '#3a3a34', lift: '#9a9a90' },
] as const satisfies readonly Accent[];

export type AccentId = (typeof ACCENTS)[number]['id'];

/**
 * The default, and it is olive because that is the brand.
 *
 * An agent who never opens the picker gets the product's own colour rather
 * than a random one, and a listing made before the picker existed keeps
 * looking like it did.
 */
export const DEFAULT_ACCENT: AccentId = 'olive';

/** An array first, so the copy-completeness test has something to iterate. */
export const ACCENT_IDS = ACCENTS.map((accent) => accent.id) as readonly AccentId[];

/**
 * The accent for an id, falling back to olive.
 *
 * Never throws and never returns undefined. This is read on the render path of
 * a public page, and a listing carrying an accent that was removed from the
 * list should lose its colour, not its page.
 */
export function accentFor(id: string | null | undefined): Accent {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0];
}

/** Whether a string names an accent we still offer. */
export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && ACCENTS.some((accent) => accent.id === value);
}
