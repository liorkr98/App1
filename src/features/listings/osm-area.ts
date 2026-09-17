import type { AreaPlace, AreaPlaces } from './area-note.js';

/**
 * OpenStreetMap features → the five groups the area paragraph talks about.
 *
 * Pure, so the classification and the de-duplication are testable without a
 * network. `web/src/lib/overpass.ts` does the request; this decides what any
 * of it means.
 *
 * A DIFFERENT TAXONOMY FROM ingest/src/osm/categories.ts, on purpose. That one
 * feeds the enrichment grid, which shows seven kinds with routed walking times
 * and a source line each. This feeds one Hebrew paragraph, where "a library
 * and a community centre and a swimming pool" are the same sentence. Sharing
 * the rules would mean one of the two lists carrying distinctions it cannot
 * express.
 */

/**
 * The raw shape Overpass returns for `out center tags`.
 *
 * A node carries `lat`/`lon`; a way or relation carries `center` because the
 * query asks for `out center`. Both are needed: a school is usually a polygon
 * and a bus stop is usually a node.
 */
export interface OsmElement {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
}

/** Where an element is, whichever way Overpass expressed it. */
export function pointOf(
  element: OsmElement,
): { lat: number; lon: number } | undefined {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : undefined;
}

// ---------------------------------------------------------------------------
// Matching what the seller typed against what OpenStreetMap calls it
// ---------------------------------------------------------------------------

/**
 * OSM SPELLS ISRAELI PLACES WITH PUNCTUATION NOBODY TYPES.
 *
 * Tel Aviv is `תל־אביב–יפו` in OSM: a maqaf (U+05BE) between the words and an
 * EN DASH before Jaffa. A seller types `תל אביב` with a space, an exact match
 * finds nothing, and the biggest city in the market silently got no area
 * paragraph at all — found by running three real addresses through the
 * endpoint, not by reading the code.
 *
 * Streets have the same problem from the other side: OSM has `שד׳ דב הוז` and
 * the seller writes `דב הוז`, or OSM has `הרצל` and the seller writes
 * `רחוב הרצל 5`.
 *
 * So both sides are matched with a pattern rather than a string. The street
 * pattern is ANCHORED AT BOTH ENDS, with the street-type prefix optional: an
 * unanchored `גן` would also match `גן רווה` somewhere else in the same city,
 * and pulling a different street's neighbours into this paragraph would put
 * real names on the wrong address — the one failure worse than no paragraph.
 *
 * Kept here, pure and tested, rather than in the query builder. Whether
 * `שד' ירושלים 12` is the same street as `שדרות ירושלים` is a fact about
 * Hebrew addresses, and `ingest/src/geocode/normalise.ts` reasons about the
 * same one for the geocoder it feeds.
 */

/** Apostrophes and quotes that all mean geresh or gershayim. */
const QUOTE_LIKE = /['"\u2018\u2019\u201C\u201D\u05F3\u05F4\u00B4\u0060]/g;

/** Bidi controls and zero-width marks, which survive copy-paste invisibly. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Space, hyphen, maqaf, en dash, em dash — all of them separate words here.
 *
 * SPELLED OUT, NOT `\s`. Overpass compiles these with POSIX regex, where `\s`
 * is not a class: it matches a literal backslash or an `s`. The patterns
 * looked right, Overpass accepted them, and every multi-word name silently
 * matched nothing — including `תל אביב`. Found by querying, not by reading.
 */
const SEPARATORS = "[ '\u05F3\u05BE\u2013\u2014-]*";

/**
 * Street-type prefixes, longest first so `שד` cannot match inside `שדרות`.
 * Dropped from the seller's text and optional in OSM's, which is what lets the
 * two meet.
 */
const STREET_PREFIXES = [
  'שדרות',
  'רחוב',
  'סמטת',
  'סמטה',
  'משעול',
  'דרך',
  'כיכר',
  'שד',
  'רח',
  'סמ',
];

/** Regex metacharacters. A place name with a bracket must not build syntax. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tidy(text: string): string {
  return text.replace(INVISIBLE, '').replace(QUOTE_LIKE, "'").replace(/\s+/g, ' ').trim();
}

/** `הרצל 5` and `הרצל 5א` are both the street `הרצל`. */
export function withoutHouseNumber(street: string): string {
  return tidy(street).replace(/\s*\d+\s*[א-ת]?\s*$/, '').trim();
}

/** `שד' ירושלים` is `ירושלים`; the prefix is OSM's business, not ours. */
export function withoutStreetPrefix(street: string): string {
  const text = withoutHouseNumber(street);

  for (const prefix of STREET_PREFIXES) {
    // The trailing part is optional so a street of `רחוב` alone reduces to
    // nothing, which is what it is. `streetPattern` then refuses it rather
    // than matching every way in the city that happens to be called that.
    const match = new RegExp(`^${prefix}'?(\\s+|$)`).exec(text);
    if (match) return text.slice(match[0].length).trim();
  }
  return text;
}

/** Each gap becomes "any of the things that separate words in OSM". */
function tolerant(text: string): string {
  // The split is ours and runs in JavaScript, so `\s` is fine here; only the
  // pattern handed to Overpass has to stay POSIX.
  return escapeRegex(text)
    .split(/[\s'\u05F3\u05BE\u2013\u2014-]+/)
    .filter((part) => part !== '')
    .join(SEPARATORS);
}

/**
 * The city, anchored at the start only.
 *
 * `תל אביב` has to match `תל־אביב–יפו`, so the tail is left open. The start is
 * anchored because `גן` must not match `רמת גן`.
 */
export function cityPattern(city: string): string {
  return `^${tolerant(tidy(city))}`;
}

/**
 * The street, as a WHOLE-WORD SUFFIX of what OSM calls it.
 *
 * `^(prefix)?name$` was the first attempt and it missed Rager in Be'er Sheva,
 * because OSM has `שדרות יצחק רגר` and a seller writes `רגר` — the extra word
 * is in the middle, where no list of prefixes can reach it. In Hebrew street
 * names the distinctive part is the end, so anchoring the END and requiring a
 * word boundary at the start covers the prefix case too: `שדרות ירושלים` ends
 * with `ירושלים`.
 *
 * Still anchored at the end, deliberately. An unanchored match would let
 * `גן` find `גן רווה` elsewhere in the same city, and neighbours from the
 * wrong street would be stated about this address by name — the one outcome
 * worse than writing no paragraph.
 *
 * Returns undefined when nothing is left to match on: a street of `12`, or of
 * `רחוב` alone, would otherwise become a pattern matching half the city.
 */
export function streetPattern(street: string): string | undefined {
  const bare = withoutStreetPrefix(street);
  if (bare.length < 2) return undefined;

  // A capturing group, not (?:…): Overpass compiles this with POSIX regex,
  // which has no non-capturing form.
  return `(^|[ '\u05F3\u05BE\u2013\u2014-])${tolerant(bare)}$`;
}

export type AreaGroup =
  | 'neighbourhood'
  | 'school'
  | 'transit'
  | 'park'
  | 'community'
  | 'shop';

/**
 * Tag rules in priority order. First match wins, because a feature carries
 * several tags and some overlap — a school with a library inside is a school.
 */
const RULES: { key: string; values: string[]; group: AreaGroup }[] = [
  { key: 'place', values: ['suburb', 'neighbourhood', 'quarter'], group: 'neighbourhood' },

  { key: 'amenity', values: ['school', 'kindergarten', 'college'], group: 'school' },

  { key: 'railway', values: ['station', 'halt', 'tram_stop'], group: 'transit' },
  { key: 'highway', values: ['bus_stop'], group: 'transit' },

  { key: 'leisure', values: ['park', 'garden', 'playground'], group: 'park' },

  {
    key: 'amenity',
    values: ['community_centre', 'library', 'theatre', 'cinema', 'arts_centre'],
    group: 'community',
  },
  { key: 'leisure', values: ['sports_centre', 'fitness_centre', 'swimming_pool'], group: 'community' },

  { key: 'shop', values: ['supermarket', 'convenience', 'greengrocer', 'bakery'], group: 'shop' },
  { key: 'amenity', values: ['pharmacy'], group: 'shop' },
];

export function groupFor(tags: Record<string, string>): AreaGroup | undefined {
  for (const rule of RULES) {
    const value = tags[rule.key];
    if (value !== undefined && rule.values.includes(value)) return rule.group;
  }
  return undefined;
}

/**
 * The name to use, Hebrew first.
 *
 * OSM's plain `name` in Israel is frequently the Latin transliteration, and a
 * Hebrew paragraph naming "Tavas Kindergarten" among Hebrew names reads as
 * broken — worse than not naming it. An unnamed feature is skipped entirely:
 * "a park" is a placeholder, and §7 forbids those.
 */
export function nameFor(tags: Record<string, string>): string | undefined {
  const candidate = tags['name:he']?.trim() || tags.name?.trim();
  if (!candidate) return undefined;

  // Latin-only names are dropped rather than transliterated. Guessing Hebrew
  // for a proper noun is exactly the kind of invention this path avoids.
  return /[\u0590-\u05FF]/.test(candidate) ? candidate : undefined;
}

/**
 * How many names of each kind to keep.
 *
 * A single street can sit near forty bus stops. Keeping them all would move
 * the choosing into the prompt, where it is the model's judgement rather than
 * ours — and the model's judgement about which of forty stops matters is not
 * better than "the first few we found".
 */
const KEEP = 6;

/**
 * Groups, named, de-duplicated, capped.
 *
 * Duplicates are the norm rather than the exception: a bus stop exists once
 * per direction under the same name, and a school is often both a node and a
 * building polygon.
 */
export function placesFromOsm(
  elements: readonly OsmElement[],
  where: { city: string; street?: string },
): AreaPlaces {
  const buckets: Record<AreaGroup, AreaPlace[]> = {
    neighbourhood: [],
    school: [],
    transit: [],
    park: [],
    community: [],
    shop: [],
  };

  /*
   * The street's own geometry, which becomes the point everything is measured
   * from. The query returns its ways alongside the places for exactly this:
   * without an origin there is no routing and no map, and geocoding the
   * building is neither available nor wanted (ingest/src/geocode says why).
   */
  const streetPoints: { lat: number; lon: number }[] = [];

  for (const element of elements) {
    const tags = element.tags;
    if (!tags) continue;

    const at = pointOf(element);
    if (!at) continue;

    const group = groupFor(tags);

    // A road: the query returns the matched street alongside the places, and
    // `groupFor` classifies no road except a bus stop, so anything with a
    // `highway` tag and no group is the street we asked for.
    if (!group && tags.highway !== undefined) {
      streetPoints.push(at);
      continue;
    }

    if (!group) continue;

    const name = nameFor(tags);
    if (!name) continue;

    // The city's own boundary relation matches place=* and would otherwise
    // come back as a neighbourhood called the city.
    if (group === 'neighbourhood' && name === where.city) continue;

    if (!buckets[group].some((place) => place.name === name)) {
      const mode =
        group === 'transit'
          ? tags.railway !== undefined
            ? ('rail' as const)
            : ('bus' as const)
          : undefined;
      buckets[group].push({
        name,
        lat: at.lat,
        lon: at.lon,
        ...(mode ? { mode } : {}),
      });
    }
  }

  const origin = midpoint(streetPoints);

  return {
    city: where.city,
    ...(where.street ? { street: where.street } : {}),
    ...(origin ? { origin } : {}),
    neighbourhoods: buckets.neighbourhood.slice(0, KEEP),
    schools: nearestFirst(buckets.school, origin).slice(0, KEEP),
    transit: nearestFirst(buckets.transit, origin).slice(0, KEEP),
    parks: nearestFirst(buckets.park, origin).slice(0, KEEP),
    community: nearestFirst(buckets.community, origin).slice(0, KEEP),
    shops: nearestFirst(buckets.shop, origin).slice(0, KEEP),
  };
}

/** The middle of the matched road, as the point to measure from. */
function midpoint(
  points: readonly { lat: number; lon: number }[],
): { lat: number; lon: number } | undefined {
  if (points.length === 0) return undefined;

  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}

/**
 * Closest first, so the six we keep are the six nearest rather than the six
 * Overpass happened to list.
 *
 * ORDERING ONLY. This is straight-line distance and it never becomes a claim:
 * nothing printed anywhere is derived from it, and the walking time comes from
 * a router or is absent (CLAUDE.md §2). Sorting candidates by how far they
 * look is a different act from telling a buyer how long a walk takes.
 */
function nearestFirst(
  places: readonly AreaPlace[],
  origin: { lat: number; lon: number } | undefined,
): AreaPlace[] {
  if (!origin) return [...places];

  const roughly = (place: AreaPlace) => {
    const dLat = place.lat - origin.lat;
    // Longitude degrees are shorter than latitude degrees away from the
    // equator; at Israel's latitude the factor is about 0.84.
    const dLon = (place.lon - origin.lon) * Math.cos((origin.lat * Math.PI) / 180);
    return dLat * dLat + dLon * dLon;
  };

  return [...places].sort((a, b) => roughly(a) - roughly(b));
}
