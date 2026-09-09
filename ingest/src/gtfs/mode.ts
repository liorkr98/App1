/**
 * GTFS `route_type` → the four modes the page distinguishes.
 *
 * WHY THIS FILE REFUSES TO GUESS
 *
 * Light rail must never be lumped in with bus. Proximity to the light rail is
 * one of the highest-value facts on a Tel Aviv page — arguably the single most
 * valuable — and a page that calls the red line "a bus stop" has thrown away
 * the thing the reader most wanted to know, while looking entirely correct.
 *
 * So an unrecognised route_type throws. It does NOT fall back to bus.
 *
 * That choice is deliberate and it is the opposite of the usual instinct.
 * Defaulting to bus makes the sync succeed and the data wrong; throwing makes
 * the sync fail loudly with the unmapped value in the message, and someone
 * spends ten minutes adding a line here. The first failure is discovered by a
 * user, the second by us.
 *
 * NOT YET VERIFIED AGAINST THE REAL FEED
 *
 * The Israeli Ministry of Transport feed is a zip at gtfs.mot.gov.il and could
 * not be downloaded from the development machine, so WHICH of these values it
 * actually uses for the light rail is unconfirmed — see docs/DATA-SOURCES.md.
 * Both the basic and the extended ranges are mapped because different Israeli
 * exports have been reported using each. The first real sync will either work
 * or throw with the exact value to add, which is why it throws.
 */

export type TransitMode = 'light_rail' | 'train' | 'metro' | 'bus';

export class UnmappedRouteType extends Error {
  constructor(readonly routeType: string) {
    super(
      `GTFS route_type ${routeType} is not mapped to a mode. Add it to ` +
        'ingest/src/gtfs/mode.ts rather than letting it default — an unmapped ' +
        'type silently becoming "bus" is how the light rail disappears.',
    );
    this.name = 'UnmappedRouteType';
  }
}

/**
 * Basic route types, from the GTFS specification.
 *
 * 0 is "Tram, Streetcar, Light rail" — the spec groups them, and for our
 * purposes they are all light_rail.
 */
const BASIC: Record<number, TransitMode> = {
  0: 'light_rail',
  1: 'metro', // Subway / metro
  2: 'train', // Rail — intercity and commuter
  3: 'bus',
  // 4 ferry, 5 cable tram, 6 aerial lift, 7 funicular, 11 trolleybus and
  // 12 monorail are deliberately absent. None of them exist in Israel today,
  // and mapping a mode we have never seen would be inventing a fact about the
  // feed. If one appears, it throws and we look at it.
};

/**
 * Extended route types (the 100–1700 hierarchy).
 *
 * Ranges rather than exact values: the extended set defines a base per hundred
 * with subtypes beneath it, so 900–999 are all tram-like whatever the subtype.
 */
const EXTENDED: { from: number; to: number; mode: TransitMode }[] = [
  { from: 100, to: 199, mode: 'train' }, // Railway service
  { from: 200, to: 299, mode: 'bus' }, // Coach service
  { from: 400, to: 499, mode: 'metro' }, // Urban railway / metro
  { from: 700, to: 799, mode: 'bus' }, // Bus service
  { from: 800, to: 899, mode: 'bus' }, // Trolleybus
  { from: 900, to: 999, mode: 'light_rail' }, // Tram service
];

/**
 * Maps one `route_type` value, or throws.
 *
 * Takes a string because that is what the CSV yields, and because an empty or
 * non-numeric value is a real thing feeds contain — it should fail here rather
 * than become NaN and then quietly match nothing.
 */
export function toMode(routeType: string): TransitMode {
  const raw = routeType.trim();

  // Number('') is 0, and 0 is light_rail. So without this line a BLANK
  // route_type — which real feeds do contain — silently becomes the red line:
  // the single most consequential mislabel in the product, produced by the
  // one function written to prevent it. Caught by its own test on the first
  // run, which is the entire argument for having written the test.
  if (raw === '') throw new UnmappedRouteType(routeType);

  const value = Number(raw);
  if (!Number.isInteger(value)) throw new UnmappedRouteType(routeType);

  const basic = BASIC[value];
  if (basic) return basic;

  for (const range of EXTENDED) {
    if (value >= range.from && value <= range.to) return range.mode;
  }

  throw new UnmappedRouteType(routeType);
}

/**
 * Which mode wins when several routes serve one stop.
 *
 * A stop served by the light rail and four bus lines is a LIGHT RAIL stop to
 * anyone deciding where to live. Ranking by usefulness-to-a-reader rather than
 * by frequency is the whole reason we keep mode at all.
 */
const PRECEDENCE: TransitMode[] = ['light_rail', 'metro', 'train', 'bus'];

export function dominantMode(modes: TransitMode[]): TransitMode {
  for (const mode of PRECEDENCE) {
    if (modes.includes(mode)) return mode;
  }
  // Only reachable with an empty list, which means a stop no route serves.
  return 'bus';
}
