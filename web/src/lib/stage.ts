import type { Listing } from '@/types/listing';
import { clusters } from '@/features/motion/clusters';
import type { PerUnitPrice } from './price';

/**
 * What every composed first screen computes from the listing, once.
 * Stage.astro keeps its own copies for the four layouts it already had;
 * the stages in components/stages/ use these.
 */

/** "Street, City" when the street is public, else the city, else nothing. */
export function stagePlace(listing: Listing): string {
  return listing.location?.street
    ? `${listing.location.street}, ${listing.location.city}`
    : (listing.location?.city ?? '');
}

export function titleLines(listing: Listing): string[] {
  return listing.title.split('\n');
}

/**
 * The cover's style: its focal point, and the view-transition name the
 * dashboard card shares for the card→page morph (M11).
 */
export function coverStyle(listing: Listing): string {
  const cover = listing.media.cover;
  return [
    cover.focalX != null || cover.focalY != null
      ? `object-position:${cover.focalX ?? 50}% ${cover.focalY ?? 50}%`
      : '',
    `view-transition-name:cover-${listing.slug}`,
  ]
    .filter(Boolean)
    .join(';');
}

export function priceProps(listing: Listing, perUnit: PerUnitPrice | undefined) {
  return {
    price: listing.price,
    listPrice: listing.listPrice,
    priceNote: listing.priceNote,
    priceDisplay: listing.priceDisplay,
    perUnit,
  };
}

/**
 * Where each title line's letter cascade starts, so line two carries on from
 * line one instead of restarting (M2). Spaces are not letters.
 */
export function letterOffsets(lines: readonly string[]): number[] {
  let at = 0;
  return lines.map((line) => {
    const start = at;
    at += clusters(line.replace(/\s+/g, '')).length;
    return start;
  });
}

/**
 * The description's first sentence, as a magazine dek. Undefined when the
 * first sentence is too long to read as one — a dek that is a paragraph is
 * just the description twice.
 */
export function firstSentence(description: string, max = 170): string | undefined {
  const first = description.trim().split(/(?<=[.!?])\s+/)[0]?.trim();
  if (!first || first.length > max) return undefined;
  return first;
}
