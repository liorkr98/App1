import type {
  NearbyPlace,
  NearbySchool,
  NearbyTransit,
  PlaceCategory,
  PropertyEnrichment,
  ProximitySummary,
  TransitMode,
} from '@/types/listing.js';

import { db } from './db.js';
import {
  CANDIDATE_RADIUS_METRES,
  MAX_WALK_MINUTES,
  toWalkMinutes,
  walkingSeconds,
  type Point,
} from './osrm.js';

/**
 * Composes the enrichment payload for one coordinate.
 *
 * Runs ONCE, at publish, and the result is stored. Never at page render:
 * routing is the most expensive call in the system and the listing page has a
 * hard performance floor (RESEARCH.md §4.5).
 *
 * Shape and caps come from the stage brief; the reasons they are what they are
 * follow below, at the point each one bites.
 */

/** Nearest N shown per group; the rest become a count, or nothing. */
const CAP_TRANSIT = 4;
const CAP_SCHOOLS = 4;
const CAP_PER_PLACE_CATEGORY = 3;

/** Straight-line, and named for it. The summary claims metres, not minutes. */
const SUMMARY_RADIUS_METRES = 500;

interface CandidateRow {
  kind: 'transit' | 'school' | 'place';
  id: string;
  name: string;
  lon: number;
  lat: number;
  metres: number;
  attr_a: string | null;
  attr_b: string | null;
  attr_c: string | null;
}

interface SourceRow {
  source: string;
  display_name: string;
  attribution: string | null;
  last_synced_at: string | null;
}

const TRANSIT_MODES = new Set<TransitMode>(['light_rail', 'train', 'metro', 'bus']);
const PLACE_CATEGORIES = new Set<PlaceCategory>([
  'restaurant',
  'cafe',
  'grocery',
  'pharmacy',
  'park',
  'culture',
  'gym',
]);

export async function buildProximity(origin: Point): Promise<PropertyEnrichment> {
  const [candidates, sources] = await Promise.all([fetchCandidates(origin), fetchSources()]);

  // One OSRM call for everything. A hundred candidates is a hundred round
  // trips otherwise, and that is the difference between a publish that feels
  // instant and one that does not.
  const durations = await walkingSeconds(
    origin,
    candidates.map((c) => ({ lon: c.lon, lat: c.lat })),
  );

  const transit: NearbyTransit[] = [];
  const schools: NearbySchool[] = [];
  const places: NearbyPlace[] = [];

  candidates.forEach((candidate, index) => {
    const seconds = durations[index];
    // null means OSRM could not reach it on the pedestrian network — an
    // island with no footway connection. Not zero, and not renderable.
    if (seconds === null || seconds === undefined) return;

    const walkMinutes = toWalkMinutes(seconds);
    if (walkMinutes > MAX_WALK_MINUTES) return;

    if (candidate.kind === 'transit') {
      const mode = candidate.attr_a as TransitMode;
      // An unmapped mode is a GTFS change we have not handled. Dropping it is
      // right: showing the red line as a bus is worse than not showing it.
      if (!TRANSIT_MODES.has(mode)) return;

      transit.push({
        id: candidate.id,
        name: candidate.name,
        mode,
        routes: (candidate.attr_b ?? '').split(',').filter(Boolean),
        walkMinutes,
        ...provenance(sources, 'transit'),
      });
      return;
    }

    if (candidate.kind === 'school') {
      schools.push({
        id: candidate.id,
        name: candidate.name,
        type: candidate.attr_a ?? '',
        stream: candidate.attr_b ?? '',
        ...(candidate.attr_c ? { gradeSpan: candidate.attr_c } : {}),
        walkMinutes,
        ...provenance(sources, 'schools'),
      });
      return;
    }

    const category = candidate.attr_a as PlaceCategory;
    if (!PLACE_CATEGORIES.has(category)) return;

    places.push({
      id: candidate.id,
      name: candidate.name,
      category,
      walkMinutes,
      ...provenance(sources, 'places'),
    });
  });

  const summary = buildSummary(candidates, durations, places);

  return {
    category: 'property',
    // Light rail first regardless of distance. It is the single fact a Tel
    // Aviv reader is looking for, and burying it under three bus stops that
    // happen to be nearer defeats the point of distinguishing modes at all.
    transit: capTransit(transit),
    schools: byWalk(schools).slice(0, CAP_SCHOOLS),
    places: capPlacesPerCategory(places),
    summary,
    attributions: attributionsFor(sources, { places: places.length > 0 }),
  };
}

async function fetchCandidates(origin: Point): Promise<CandidateRow[]> {
  const { data, error } = await db().rpc('nearby_candidates', {
    p_lat: origin.lat,
    p_lon: origin.lon,
    p_radius_metres: CANDIDATE_RADIUS_METRES,
  });

  if (error) throw new Error(`nearby_candidates failed: ${error.message}`);
  return (data ?? []) as CandidateRow[];
}

async function fetchSources(): Promise<Map<string, SourceRow>> {
  const { data, error } = await db()
    .from('source_sync')
    .select('source, display_name, attribution, last_synced_at');

  if (error) throw new Error(`source_sync unreadable: ${error.message}`);
  return new Map((data ?? []).map((row) => [(row as SourceRow).source, row as SourceRow]));
}

/**
 * Citation for one source.
 *
 * A source that has never successfully synced has a null `last_synced_at`, and
 * we cite the empty string rather than today's date. There should be no rows
 * from such a source anyway — but if there are, an honestly blank date is
 * better than a fabricated one.
 */
function provenance(
  sources: Map<string, SourceRow>,
  source: string,
): { sourceName: string; sourceDate: string } {
  const row = sources.get(source);
  return {
    sourceName: row?.display_name ?? source,
    sourceDate: row?.last_synced_at?.slice(0, 10) ?? '',
  };
}

const byWalk = <T extends { walkMinutes: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.walkMinutes - b.walkMinutes);

/**
 * Keeps the nearest rail-type stop even when buses are closer.
 *
 * Israeli bus coverage is dense enough that a naive "nearest four" is four bus
 * stops almost everywhere, which tells a reader nothing they did not assume.
 */
function capTransit(transit: NearbyTransit[]): NearbyTransit[] {
  const sorted = byWalk(transit);
  const rail = sorted.filter((stop) => stop.mode !== 'bus');
  const bus = sorted.filter((stop) => stop.mode === 'bus');

  return [...rail, ...bus].slice(0, CAP_TRANSIT);
}

function capPlacesPerCategory(places: NearbyPlace[]): NearbyPlace[] {
  const perCategory = new Map<PlaceCategory, NearbyPlace[]>();

  for (const place of byWalk(places)) {
    const bucket = perCategory.get(place.category) ?? [];
    if (bucket.length >= CAP_PER_PLACE_CATEGORY) continue;
    bucket.push(place);
    perCategory.set(place.category, bucket);
  }

  return [...perCategory.values()].flat();
}

/**
 * The headline numbers.
 *
 * Every field is omitted rather than zeroed when it has no answer. "0 מסעדות"
 * and saying nothing are different claims, and for a moshav the second is the
 * true one.
 */
function buildSummary(
  candidates: CandidateRow[],
  durations: (number | null)[],
  places: NearbyPlace[],
): ProximitySummary {
  const summary: ProximitySummary = {};

  // Straight-line, because the field is named for metres. Counted over all
  // candidates rather than the capped list — the cap is a display decision,
  // not a fact about the neighbourhood.
  const restaurants = candidates.filter(
    (c, index) =>
      c.kind === 'place' &&
      c.attr_a === 'restaurant' &&
      c.metres <= SUMMARY_RADIUS_METRES &&
      durations[index] !== null,
  ).length;
  if (restaurants > 0) summary.restaurantsWithin500m = restaurants;

  const nearest = (category: PlaceCategory): NearbyPlace | undefined =>
    byWalk(places.filter((place) => place.category === category))[0];

  const grocery = nearest('grocery');
  if (grocery) summary.nearestGrocery = { name: grocery.name, walkMinutes: grocery.walkMinutes };

  const park = nearest('park');
  if (park) summary.nearestPark = { name: park.name, walkMinutes: park.walkMinutes };

  return summary;
}

/**
 * ODbL attribution, carried with the data rather than hardcoded in a footer.
 *
 * A page that renders no OSM places carries no OSM attribution, and a page
 * that gains a new attributed source cannot forget to add one. It is a licence
 * condition (CLAUDE.md §9), so it should not depend on a template remembering.
 */
function attributionsFor(
  sources: Map<string, SourceRow>,
  used: { places: boolean },
): string[] {
  const out: string[] = [];
  if (used.places) {
    const attribution = sources.get('places')?.attribution;
    if (attribution) out.push(attribution);
  }
  return out;
}
