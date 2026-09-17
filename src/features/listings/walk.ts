/**
 * Walking times: what counts as one, and what may be said about it.
 *
 * ===================== ROUTED, OR ABSENT. NOTHING ELSE =====================
 * A walking time on this page comes from a pedestrian router following the
 * pavement network, or it does not appear. There is no third option, and the
 * reason is the one CLAUDE.md §2 gives: straight-line distance lies in Israel,
 * and it lies in the direction that flatters the listing. The Ayalon, a rail
 * cutting, a wadi, a walled compound — any of them turns 300 metres into a
 * twenty-minute walk, and the buyer finds out by walking it.
 *
 * So `AreaPlace.walkMinutes` is optional, `undefined` renders as nothing at
 * all, and no code anywhere derives it from the coordinates beside it. The
 * coordinates order candidates and draw the map; the minutes come from a
 * router or are missing.
 * ===========================================================================
 *
 * This module is the pure part: which candidates are worth routing, what a
 * usable answer looks like, and how seconds become a minute figure. The
 * transport — OSRM's `/table`, Valhalla's `/sources_to_targets` — is in
 * web/src/lib/routing.ts, behind one interface, so a self-hosted graph and a
 * hosted service are a configuration difference and not a code path.
 */

/** Beyond this, "walking distance" is not a useful claim to make. */
export const MAX_WALK_MINUTES = 25;

/**
 * How many destinations one routing call may carry.
 *
 * A matrix is one request for many destinations, which is the whole reason to
 * use one — but a hosted router applies a fair-use limit to the SIZE of the
 * matrix, not only the number of requests. Thirty-six is the six names per
 * group this product keeps, across six groups.
 */
export const MAX_ROUTED_DESTINATIONS = 36;

export interface WalkPoint {
  lat: number;
  lon: number;
}

/**
 * Seconds from a router into the minutes a page may print.
 *
 * Rounds to the nearest minute and floors at one: a routed forty seconds is
 * "a minute", and "0 דקות הליכה" reads as a mistake rather than as close.
 *
 * Returns undefined for anything a page should not claim — an unreachable
 * destination, a negative or absurd figure, or a walk long enough that calling
 * it walking distance is a stretch. Undefined means the place is still named,
 * with no time beside it.
 */
export function walkMinutesFromSeconds(seconds: number | null | undefined): number | undefined {
  if (seconds === null || seconds === undefined) return undefined;
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;

  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes <= MAX_WALK_MINUTES ? minutes : undefined;
}
