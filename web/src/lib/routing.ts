import { env } from 'cloudflare:workers';

import {
  MAX_ROUTED_DESTINATIONS,
  walkMinutesFromSeconds,
  type WalkPoint,
} from '@/features/listings/walk';

/**
 * Routed walking times, from a pedestrian router.
 *
 * ========================= WHY OSRM IS NOT RUNNING =========================
 * CLAUDE.md §2 chose OSRM, foot profile, SELF-HOSTED, and docs/INGEST.md
 * records that it has never been stood up. That is not an oversight, it is
 * what the choice costs: OSRM needs a routing graph built from the Israel OSM
 * extract — `osrm-extract` with foot.lua, then `osrm-partition` and
 * `osrm-customize` — and then a process holding that graph in memory to answer
 * queries. It is a service, not a library, and nothing in a Cloudflare Worker
 * can host one.
 *
 * `osrm/` in this repository now contains that service, ready to deploy. Set
 * `OSRM_URL` to it and this module uses it in preference to anything else.
 * ===========================================================================
 *
 * ===================== WHAT RUNS UNTIL IT IS DEPLOYED =====================
 * Valhalla on the OpenStreetMap Foundation's own instance, pedestrian costing.
 * One matrix request per listing, cached on the row, and no key to hold.
 *
 * NOT the OSRM demo server, and the reason is measured rather than assumed:
 * `router.project-osrm.org/table/v1/foot/...` answers 200 and returns CAR
 * times. For a 370-metre hop in Tel Aviv it said 162 seconds where Valhalla's
 * pedestrian costing said 277. A page claiming three minutes for a five-minute
 * walk is precisely the failure §2 forbids, so the demo server is unusable for
 * this no matter how convenient the URL looks.
 *
 * Both are public services used lightly and cached hard. Neither is Google
 * Distance Matrix, which is banned for a different reason — a per-listing cost
 * forever, which is the economics this product is built to avoid.
 * ==========================================================================
 */

/** OSRM's own default port and path shape, for a self-hosted `osrm-routed`. */
function osrmTableUrl(base: string, origin: WalkPoint, points: readonly WalkPoint[]): string {
  const coords = [origin, ...points].map((p) => `${p.lon},${p.lat}`).join(';');
  const destinations = points.map((_, index) => index + 1).join(';');

  return `${base.replace(/\/+$/, '')}/table/v1/foot/${coords}?sources=0&destinations=${destinations}&annotations=duration`;
}

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/sources_to_targets';

/** Identifiable, because using somebody's service anonymously is not fair use. */
const USER_AGENT = 'hasivuv.com listing pages (contact: https://hasivuv.com/contact/)';

/** A router that cannot answer in this long is not going to. */
const TIMEOUT_MS = 12_000;

/**
 * Walking minutes from one origin to many places, in one request.
 *
 * Returns an array parallel to `points`, with `undefined` wherever there is no
 * answer worth printing: an unreachable destination, a walk past the cap, or a
 * router that did not respond. A caller must render those as no time at all —
 * never as zero, and never as a distance instead.
 */
export async function walkMinutes(
  origin: WalkPoint,
  points: readonly WalkPoint[],
): Promise<(number | undefined)[]> {
  const asked = points.slice(0, MAX_ROUTED_DESTINATIONS);
  if (asked.length === 0) return [];

  const seconds =
    (await osrmSeconds(origin, asked)) ?? (await valhallaSeconds(origin, asked));

  if (!seconds) return points.map(() => undefined);

  return points.map((_, index) =>
    index < asked.length ? walkMinutesFromSeconds(seconds[index]) : undefined,
  );
}

/** The self-hosted graph, when there is one. */
async function osrmSeconds(
  origin: WalkPoint,
  points: readonly WalkPoint[],
): Promise<(number | null)[] | undefined> {
  const base = (env as { OSRM_URL?: string }).OSRM_URL;
  if (!base) return undefined;

  try {
    const response = await fetch(osrmTableUrl(base, origin, points), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as {
      code?: string;
      durations?: (number | null)[][];
    };
    if (body.code !== 'Ok' || !Array.isArray(body.durations?.[0])) return undefined;

    return body.durations[0];
  } catch {
    return undefined;
  }
}

/** The OSMF's Valhalla, pedestrian costing, until the graph above exists. */
async function valhallaSeconds(
  origin: WalkPoint,
  points: readonly WalkPoint[],
): Promise<(number | null)[] | undefined> {
  const json = JSON.stringify({
    sources: [{ lat: origin.lat, lon: origin.lon }],
    targets: points.map((point) => ({ lat: point.lat, lon: point.lon })),
    costing: 'pedestrian',
  });

  try {
    const response = await fetch(`${VALHALLA_URL}?json=${encodeURIComponent(json)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as {
      sources_to_targets?: { time?: number | null; to_index?: number }[][];
    };
    const row = body.sources_to_targets?.[0];
    if (!Array.isArray(row)) return undefined;

    // Indexed by `to_index` rather than by position: the response is ordered
    // in practice, and relying on that would break silently if it stopped.
    const seconds: (number | null)[] = points.map(() => null);
    for (const cell of row) {
      const index = cell.to_index;
      if (typeof index === 'number' && index >= 0 && index < seconds.length) {
        seconds[index] = typeof cell.time === 'number' ? cell.time : null;
      }
    }
    return seconds;
  } catch {
    return undefined;
  }
}
