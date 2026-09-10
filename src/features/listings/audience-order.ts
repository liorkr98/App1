import type { ListingAudience } from '../../types/listing.js';

/**
 * Reorders a category's facts for the buyer the listing is aimed at.
 *
 * A resident and an investor scan the same grid for different things. The
 * resident wants rooms, floor and what the building has. The investor wants
 * area — because price per m² is the number they compare between listings and
 * area is its denominator — and then the running costs that decide the yield.
 *
 * Averaging the two produces a grid that serves neither, so the editor asks
 * once and this puts the answer into effect.
 *
 * Generic over anything carrying a `key`, so it works on schema definitions
 * and on rendered cells without either knowing about the other.
 */
export function orderForAudience<T extends { key: string }>(
  items: readonly T[],
  audience: ListingAudience,
  investorLead: readonly string[] | undefined,
): T[] {
  if (audience !== 'investor' || !investorLead || investorLead.length === 0) {
    return [...items];
  }

  const byKey = new Map(items.map((item) => [item.key, item]));

  // In the order the SCHEMA lists them, not the order they appear in the
  // grid — the schema's order is the priority being expressed.
  const promoted: T[] = [];
  for (const key of investorLead) {
    const item = byKey.get(key);
    // A key that names a fact this listing did not answer is skipped rather
    // than left as a hole. The grid reflows; it does not gap.
    if (item) promoted.push(item);
  }

  const lead = new Set(promoted.map((item) => item.key));
  const rest = items.filter((item) => !lead.has(item.key));

  return [...promoted, ...rest];
}
