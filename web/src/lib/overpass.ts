import {
  cityPattern,
  placesFromOsm,
  streetPattern,
  withoutStreetPrefix,
  type OsmElement,
} from '@/features/listings/osm-area';
import type { AreaPlaces } from '@/features/listings/area-note';

/**
 * What is around an address, from OpenStreetMap, in one request.
 *
 * ===================== WHY THIS AND NOT A GEOCODER =====================
 * The paragraph has to be about a real place, which means turning "סוקולוב 12,
 * חולון" into real neighbours. The obvious route is geocode then query, and
 * both halves are blocked today:
 *
 *   * `ingest/src/geocode/index.ts` states the rule plainly — NEVER the public
 *     nominatim.openstreetmap.org, whose usage policy forbids systematic
 *     queries. Our own Nominatim is not running (docs/INGEST.md).
 *   * OSRM is not running either, so there are no routed walking times.
 *
 * Overpass does the whole thing in one query without a geocoder: find the
 * street INSIDE the city boundary, then everything named within 600 metres of
 * that street. No coordinate ever has to be resolved, stored, or trusted — and
 * the answer is about the street rather than the exact door, which is the
 * honest scope for a paragraph about a neighbourhood anyway.
 *
 * THIS IS A COMMUNITY SERVICE AND WE USE IT LIGHTLY. One request per listing,
 * the result cached on the listing row, and every failure falls back to copy
 * built from the seller's own facts. If this product ever runs at volume the
 * right answer is the Israel extract we already download for OSRM
 * (ingest/src/osm/extract.ts), not a heavier share of somebody's donation.
 *
 * NOT AT PAGE RENDER TIME (CLAUDE.md §12). This runs when an agent presses a
 * button in the editor; the published page reads the stored text and nothing
 * else.
 * =======================================================================
 */

/**
 * Two instances, tried in order.
 *
 * Overpass answers 504 under load often enough to matter — it did so twice
 * while this was being tested — and a second public instance is the standard
 * way consumers cope. One request each, at most, and only when the first
 * fails.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Overpass asks for identification, and being identifiable is fair. */
const USER_AGENT = 'hasivuv.com listing pages (contact: https://hasivuv.com/contact/)';

/**
 * 600 metres from the street, which is a neighbourhood rather than a doorstep.
 *
 * Deliberately never stated on the page: see area-note.ts. It decides what we
 * look at, not what we claim.
 */
const RADIUS_M = 600;

/**
 * Twelve seconds, and the number is a measurement rather than a guess.
 *
 * A healthy instance answers this query in five to nine seconds. A loaded one
 * does not answer at all — it sits until it 504s, and waiting longer buys
 * nothing. Two instances at twelve seconds is a worst case of twenty-four,
 * with the fallback paragraph already written and a retry the editor can make
 * later.
 */
const TIMEOUT_MS = 12_000;

/**
 * One query, three steps: the city boundary, the street inside it, and the
 * named features around the street.
 *
 * MATCHED BY PATTERN, NOT BY STRING. OSM writes Tel Aviv as `תל־אביב–יפו` and
 * streets as `שד׳ דב הוז`, and nobody types either — see `cityPattern` and
 * `streetPattern`, which is where that reasoning lives and is tested.
 *
 * Both patterns go through JSON.stringify, so a name carrying a quote cannot
 * terminate the literal and change the query.
 */
export function areaQuery(city: string, street: string): string {
  const pattern = streetPattern(street);
  if (!pattern) throw new Error('street has nothing to match on');

  /*
   * EVERY CLAUSE HERE WAS MEASURED, and two earlier shapes were wrong.
   *
   * `area[name=...]` with a bare `way(area.city)` scan: 17–23 seconds for
   * Arlozorov in Tel Aviv on a good run, HTTP 504 on a bad one, 90 seconds on
   * the mirror. Unusable from an editor.
   *
   * A BOUNDING BOX instead of the area: fast, and WRONG. Tel Aviv's box
   * reaches into Ramat Gan and Givatayim, both of which have an Arlozorov, so
   * the paragraph named real schools from the wrong municipality. Stating a
   * neighbourhood confidently and incorrectly is the one outcome worse than
   * writing no paragraph.
   *
   * `map_to_area` off the boundary relation, with `(area.city)` on the POIs as
   * well as the street: 5.7 seconds for the same address, and nothing from a
   * neighbouring town. Correct and fast, so this is the shape.
   */
  return `[out:json][timeout:50];
rel["boundary"="administrative"]["name"~${JSON.stringify(cityPattern(city))}]->.rels;
.rels map_to_area->.city;
way(area.city)["highway"]["name"~${JSON.stringify(pattern)}]->.scope;
(
  nwr(around.scope:${RADIUS_M})(area.city)["amenity"~"^(school|kindergarten|college|library|theatre|cinema|arts_centre|community_centre|pharmacy)$"];
  nwr(around.scope:${RADIUS_M})(area.city)["leisure"~"^(park|garden|playground|sports_centre|fitness_centre|swimming_pool)$"];
  nwr(around.scope:${RADIUS_M})(area.city)["shop"~"^(supermarket|convenience|greengrocer|bakery)$"];
  nwr(around.scope:${RADIUS_M})(area.city)["highway"="bus_stop"];
  nwr(around.scope:${RADIUS_M})(area.city)["railway"~"^(station|halt|tram_stop)$"];
  nwr(around.scope:800)(area.city)["place"~"^(suburb|neighbourhood|quarter)$"];
);
out center tags 300;`;
}

/**
 * The named neighbours of an address, or undefined.
 *
 * ONLY WITH A STREET. Without one there is nothing to centre on, and the
 * tempting fallback — the city's centre point — would name real schools and
 * parks from a part of town the flat is not in. A wrong neighbourhood stated
 * confidently is worse than a plainer description, so the caller falls back to
 * the seller's own facts instead.
 *
 * Undefined for every failure: a timeout, a rate limit, an unknown city, a
 * street OSM spells in a way the pattern still missed. None of it is worth
 * failing a request over.
 */
export async function areaPlaces(
  city: string,
  street: string,
): Promise<AreaPlaces | undefined> {
  const where = addressForQuery(city, street);
  if (!where) return undefined;

  const query = areaQuery(where.city, where.street);

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) continue;

      const body = (await response.json()) as { elements?: OsmElement[] };
      if (!Array.isArray(body.elements) || body.elements.length === 0) {
        // A real answer meaning "no such street here". Asking a second
        // instance the same question gets the same answer from the same data.
        return undefined;
      }

      return placesFromOsm(body.elements, where);
    } catch {
      // Timeout or transport failure: worth trying the other instance.
    }
  }

  return undefined;
}

/**
 * The address as this module will use it, or undefined if it cannot.
 *
 * Exported because the CALLER caches by it. The cache key has to be the
 * normalised street — `סוקולוב`, not `סוקולוב 12` — or every press compares a
 * raw street against a stored normalised one, never matches, and queries
 * Overpass again. That is exactly what happened.
 */
export function addressForQuery(
  city: string,
  street: string,
): { city: string; street: string } | undefined {
  const trimmedCity = city.trim();
  const bare = withoutStreetPrefix(street);

  if (!trimmedCity || !streetPattern(street)) return undefined;
  return { city: trimmedCity, street: bare };
}
