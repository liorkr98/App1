/**
 * The one rule behind every launch price on screen (docs/PRICING.md §6,
 * never fake scarcity): a seat remains only when the real count says so.
 * Unread, malformed or full counts all mean no. Tiny and dependency-free on
 * purpose: the homepage imports it.
 */
export interface CohortCount {
  cohort: string;
  used: number;
  cap: number;
}

/** Seats left in a cohort, or null when the count was not read or makes no sense. */
export function seatsLeft(counts: readonly CohortCount[] | null, cohort: string): number | null {
  const count = counts?.find((row) => row.cohort === cohort);
  if (!count || !Number.isInteger(count.used) || !Number.isInteger(count.cap)) return null;
  return Math.max(0, count.cap - count.used);
}
