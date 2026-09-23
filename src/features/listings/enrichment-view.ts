import type { EnrichmentBlock, NearbyTransit } from '@/types/listing.js';

/**
 * True when the enrichment block has anything to paint.
 *
 * A payload can exist and still be empty (every list zero). That must omit
 * the whole section — never a heading over a hole (CLAUDE.md §7).
 */
export function enrichmentHasContent(block: EnrichmentBlock): boolean {
  if (block.category === 'property') {
    return (
      block.transit.length > 0 ||
      block.schools.length > 0 ||
      block.places.length > 0 ||
      (block.civic?.length ?? 0) > 0
    );
  }
  return block.ownershipHistory.length > 0 || Boolean(block.testValidUntil);
}

/** How many extras the group head reports after MAX_ROWS. Zero → no chip. */
export function leftoverCount(total: number, maxRows: number): number {
  return Math.max(0, total - maxRows);
}

/**
 * Rail-type stops before buses, each set sorted by walking time.
 *
 * Light rail is the high-value line on a Tel Aviv page, even when a bus is
 * closer. The minutes column is still the visual anchor of each row.
 */
export function orderTransit(transit: readonly NearbyTransit[]): NearbyTransit[] {
  const byWalk = (a: NearbyTransit, b: NearbyTransit) => a.walkMinutes - b.walkMinutes;
  return [
    ...transit.filter((stop) => stop.mode !== 'bus').sort(byWalk),
    ...transit.filter((stop) => stop.mode === 'bus').sort(byWalk),
  ];
}
