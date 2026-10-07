import type { AreaPlace, AreaPlaces, PropertyEnrichment } from '../../types/listing.js';

/**
 * The Walk template's route: every place the enrichment found, as one list
 * of stops sorted by walking minutes from the door.
 *
 * Minutes are ROUTED walking times (OSRM/Valhalla, CLAUDE.md §2) — never a
 * straight line — so the order is the order a buyer would reach them. A name
 * that appears twice (a stop that is also a landmark) is kept once, at its
 * nearest. The list is capped: a route of forty stops is a phone book.
 */
export type WalkStop =
  | { kind: 'transit'; name: string; minutes: number; mode: PropertyEnrichment['transit'][number]['mode']; routes: string[] }
  | { kind: 'school'; name: string; minutes: number; type: string }
  | { kind: 'place'; name: string; minutes: number; category: PropertyEnrichment['places'][number]['category'] }
  | { kind: 'civic'; name: string; minutes: number; civic: NonNullable<PropertyEnrichment['civic']>[number]['kind'] }
  | { kind: 'area'; name: string; minutes: number; group: AreaStopGroup };

/** What an OpenStreetMap place is, for the stop's small label. */
export type AreaStopGroup = 'bus' | 'rail' | 'school' | 'park' | 'community' | 'shop';

export const MAX_STOPS = 10;

export function walkStops(enrichment: PropertyEnrichment, max = MAX_STOPS): WalkStop[] {
  return nearestFirst([
    ...enrichment.transit.map((t) => ({ kind: 'transit' as const, name: t.name, minutes: t.walkMinutes, mode: t.mode, routes: t.routes })),
    ...enrichment.schools.map((s) => ({ kind: 'school' as const, name: s.name, minutes: s.walkMinutes, type: s.type })),
    ...enrichment.places.map((p) => ({ kind: 'place' as const, name: p.name, minutes: p.walkMinutes, category: p.category })),
    ...(enrichment.civic ?? []).map((c) => ({ kind: 'civic' as const, name: c.name, minutes: c.walkMinutes, civic: c.kind })),
  ], max);
}

/**
 * The same route from the neighbourhood /api/area stored on the listing
 * (7 Oct 2026). Walk used to read only `enrichment`, which nothing writes for
 * a real listing, so on every page an agent actually published the route was
 * missing and Walk looked like the plain layout. These places carry ROUTED
 * minutes too (Valhalla/OSRM); a place without minutes is not a stop, because
 * a route says how far.
 */
export function areaWalkStops(places: AreaPlaces, max = MAX_STOPS): WalkStop[] {
  const timed = (group: readonly AreaPlace[], as: (place: AreaPlace) => AreaStopGroup): WalkStop[] =>
    group.flatMap((place) =>
      typeof place.walkMinutes === 'number'
        ? [{ kind: 'area' as const, name: place.name, minutes: place.walkMinutes, group: as(place) }]
        : [],
    );
  return nearestFirst(
    [
      ...timed(places.transit, (place) => (place.mode === 'rail' ? 'rail' : 'bus')),
      ...timed(places.schools, () => 'school'),
      ...timed(places.parks, () => 'park'),
      ...timed(places.community, () => 'community'),
      ...timed(places.shops, () => 'shop'),
    ],
    max,
  );
}

function nearestFirst(stops: WalkStop[], max: number): WalkStop[] {
  const all = stops.filter((stop) => Number.isFinite(stop.minutes) && stop.minutes >= 0 && stop.name.trim() !== '');

  const sorted = all.sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name, 'he'));
  const seen = new Set<string>();
  const out: WalkStop[] = [];
  for (const stop of sorted) {
    const key = stop.name.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stop);
    if (out.length === max) break;
  }
  return out;
}
