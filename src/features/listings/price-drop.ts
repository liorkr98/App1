import type { Listing } from '../../types/listing.js';

/**
 * "המחיר ירד" (migration 0043, 14 Oct 2026).
 *
 * The database remembers the price a live listing came down from; this
 * decides whether the page, the card and the story still say so. Fourteen
 * days: long enough for the people who saw the page to be told, short
 * enough that the old figure is news and not decoration.
 *
 * The figures are the seller's own asking prices, before and after. A price
 * history, never a valuation (CLAUDE.md §7).
 */
export const PRICE_DROP_DAYS = 14;

const DAY_MS = 86_400_000;

export interface PriceDrop {
  /** The asking price it came down from. */
  was: number;
  /** The asking price now. */
  now: number;
}

type DropFields = Pick<Listing, 'price' | 'priceWas' | 'priceDroppedAt' | 'status' | 'priceDisplay'>;

/** The drop to show, or undefined. `at` is the moment of rendering. */
export function priceDrop(listing: DropFields, at: Date = new Date()): PriceDrop | undefined {
  if (listing.status !== 'published') return undefined;
  if (listing.priceDisplay === 'on_request') return undefined;
  const { price, priceWas, priceDroppedAt } = listing;
  if (priceWas === undefined || !priceDroppedAt) return undefined;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(priceWas) || priceWas <= price) return undefined;
  const since = at.getTime() - Date.parse(priceDroppedAt);
  if (!Number.isFinite(since) || since < 0 - DAY_MS || since > PRICE_DROP_DAYS * DAY_MS) return undefined;
  return { was: priceWas, now: price };
}
