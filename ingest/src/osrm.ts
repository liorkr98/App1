import { env } from './env.js';

/**
 * OSRM, foot profile — routed walking times.
 *
 * WHY NOT STRAIGHT-LINE DISTANCE
 *
 * Straight-line lies in Israel, and it lies in the direction that flatters the
 * listing. Ayalon, a rail cutting, a wadi, a walled compound: any of them turns
 * 300 metres into a twenty-minute walk. A page whose whole proposition is
 * verified data cannot afford "3 דקות הליכה" that turns out to be twenty, and
 * the reader finds out by walking it.
 *
 * WHY NOT GOOGLE DISTANCE MATRIX
 *
 * It is a per-call cost on every listing, forever. The entire economic argument
 * for this product over v1 is that enrichment cost is FIXED — ingestion compute
 * and storage — rather than variable per listing. A routing bill that scales
 * with listings gives that away for a result OSRM produces for free.
 *
 * OSRM runs in our own Fly container against the Israel OSM extract we are
 * already loading for places. One-time setup, no marginal cost.
 */

/** Beyond this, "walking distance" is not a useful claim to make. */
export const MAX_WALK_MINUTES = 25;

/**
 * Radius to gather candidates within before routing.
 *
 * Generous relative to MAX_WALK_MINUTES on purpose: the whole point is that
 * routed distance exceeds straight-line, so a radius tuned to the time limit
 * would discard exactly the places whose routing is interesting.
 */
export const CANDIDATE_RADIUS_METRES = 1_800;

export interface Point {
  lon: number;
  lat: number;
}

interface TableResponse {
  code: string;
  durations?: (number | null)[][];
  message?: string;
}

export class OsrmUnavailable extends Error {
  constructor(cause: string) {
    super(`OSRM unavailable: ${cause}`);
    this.name = 'OsrmUnavailable';
  }
}

/**
 * Walking seconds from one origin to many destinations, in one call.
 *
 * `/table` rather than one `/route` per destination: a listing has on the
 * order of a hundred candidates within the radius, and a hundred round trips
 * is the difference between a publish that feels instant and one that does
 * not.
 *
 * Returns `null` for any destination OSRM could not reach — an island of
 * pedestrian network with no connection to the origin. Null is not zero and
 * must not be rendered as one.
 */
export async function walkingSeconds(
  origin: Point,
  destinations: Point[],
): Promise<(number | null)[]> {
  if (destinations.length === 0) return [];

  const coordinates = [origin, ...destinations]
    .map((p) => `${p.lon},${p.lat}`)
    .join(';');

  // sources=0: we want one row — origin to everything — not the full N×N
  // matrix, which for 100 destinations is 10,000 pairs we would discard.
  const url =
    `${env.osrmUrl}/table/v1/foot/${coordinates}` +
    `?sources=0&annotations=duration`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new OsrmUnavailable(error instanceof Error ? error.message : 'network error');
  }

  if (!response.ok) {
    throw new OsrmUnavailable(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as TableResponse;
  if (body.code !== 'Ok' || !body.durations) {
    throw new OsrmUnavailable(body.message ?? body.code);
  }

  const row = body.durations[0];
  if (!row) throw new OsrmUnavailable('empty duration matrix');

  // Drop the origin-to-origin cell.
  return row.slice(1).map((seconds) => (typeof seconds === 'number' ? seconds : null));
}

/**
 * Rounds up, never down.
 *
 * 89 seconds is "2 דקות", not "1". Rounding a walk down is the small
 * dishonesty that a reader catches by experiencing it, and it costs more trust
 * than the extra minute ever would.
 */
export function toWalkMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
