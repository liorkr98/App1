import { env } from '../env.js';
import type { Point } from '../osrm.js';

import { normaliseAddress, type NormalisedAddress } from './normalise.js';

/**
 * Address → coordinate, via our own Nominatim.
 *
 * WHY SELF-HOSTED NOMINATIM
 *
 * The stage asked for an evaluation rather than a pick, so: GovMap documents
 * URL parameters, HTML embedding and a browser JavaScript SDK. It publishes no
 * REST base URL, no endpoint paths and no server-side auth model (checked
 * against api.govmap.gov.il/docs/intro — see docs/DATA-SOURCES.md). It is not
 * usable from a scheduled job as documented.
 *
 * Nominatim runs on the SAME Israel OSM extract that OSRM already needs and
 * that src/osm/extract.ts already downloads. So geocoding costs no new data
 * source, no new licence, no per-call fee, and no dependency on an
 * undocumented endpoint. A commercial geocoder stays as the fallback if
 * match quality disappoints — geocoding runs once per listing at publish, so a
 * small per-call cost would be acceptable there in a way it never is for
 * routing.
 *
 * NEVER the public nominatim.openstreetmap.org. Its usage policy forbids
 * systematic queries, and pointing a publish pipeline at a volunteer-funded
 * service would be both a breach and a single point of failure we do not
 * control.
 */

export class GeocodeUnavailable extends Error {
  constructor(cause: string) {
    super(`geocoder unavailable: ${cause}`);
    this.name = 'GeocodeUnavailable';
  }
}

export interface GeocodeResult {
  point: Point;
  /** What was actually sent, so a miss can be diagnosed without guessing. */
  normalised: NormalisedAddress;
  /** Nominatim's own match type, e.g. house, building, street, suburb. */
  matchType: string;
  /** The display name it matched, for eyeballing a suspicious result. */
  matchedName: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  addresstype?: string;
  type?: string;
}

/** Israel's bounding box. A result outside it is a wrong match, not a place. */
function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

/**
 * Match types precise enough to hang walking times off.
 *
 * A `suburb` or `city` result is a centroid — geocoding "פלורנטין, תל אביב"
 * returns the middle of the neighbourhood, which is a fine answer to a
 * different question. Routing from it and calling the result "4 דקות הליכה
 * מהדירה" would be a fabricated number, so those matches are refused.
 */
const PRECISE_ENOUGH = new Set([
  'house',
  'building',
  'residential',
  'address',
  'road',
  'street',
]);

/**
 * Geocodes one listing address, or returns undefined.
 *
 * Undefined is a normal outcome, not an error: a moshav address or a
 * misspelled street simply will not match, and the listing then publishes
 * with no proximity enrichment at all. C8 requires that to look intentional
 * rather than broken, and it does — the blocks are omitted, not emptied.
 */
export async function geocode(
  rawStreet: string,
  rawCity: string,
): Promise<GeocodeResult | undefined> {
  const normalised = normaliseAddress(rawStreet, rawCity);
  if (!normalised.street) return undefined;

  const params = new URLSearchParams({
    q: normalised.query,
    format: 'jsonv2',
    limit: '1',
    // Belt and braces alongside the bounding-box check below: our instance
    // only holds the Israel extract, but a misconfigured one would not.
    countrycodes: 'il',
    'accept-language': 'he',
  });

  let response: Response;
  try {
    response = await fetch(`${env.nominatimUrl}/search?${params.toString()}`, {
      headers: { 'User-Agent': 'listing-pages-ingest/1.0 (+https://hasivuv.com)' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new GeocodeUnavailable(error instanceof Error ? error.message : 'network error');
  }

  if (!response.ok) throw new GeocodeUnavailable(`HTTP ${response.status}`);

  const results = (await response.json()) as NominatimResult[];
  const best = results[0];
  if (!best) return undefined;

  const lat = Number(best.lat);
  const lon = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

  // A coordinate outside Israel means the query matched something in another
  // country with a similar name. Returning it would put a Tel Aviv flat's
  // "nearby schools" somewhere else entirely.
  if (!withinIsrael(lon, lat)) return undefined;

  const matchType = best.addresstype ?? best.type ?? '';
  if (!PRECISE_ENOUGH.has(matchType)) return undefined;

  return {
    point: { lon, lat },
    normalised,
    matchType,
    matchedName: best.display_name ?? '',
  };
}
