import type { NearbyPlace, NearbySchool, NearbyTransit, PropertyEnrichment } from '../../types/listing.js';

/**
 * The three facts that belong under the map, not in the dark block.
 *
 * Walking minutes are already routed (OSRM at publish). This file only picks
 * the nearest transit stop, school and grocery so the map section can name
 * them. Empty slots are omitted — never a placeholder (CLAUDE.md §7).
 */

export type MapNearbyKind = 'transit' | 'school' | 'grocery';

export interface MapNearbyItem {
  kind: MapNearbyKind;
  name: string;
  walkMinutes: number;
}

const nearest = <T extends { walkMinutes: number }>(items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : [...items].sort((a, b) => a.walkMinutes - b.walkMinutes)[0];

export function mapNearbyItems(enrichment: PropertyEnrichment): MapNearbyItem[] {
  const items: MapNearbyItem[] = [];

  const transit: NearbyTransit | undefined = [...enrichment.transit].sort((a, b) => {
    const rail = (stop: NearbyTransit) => (stop.mode === 'bus' ? 1 : 0);
    return rail(a) - rail(b) || a.walkMinutes - b.walkMinutes;
  })[0];
  if (transit) {
    items.push({ kind: 'transit', name: transit.name, walkMinutes: transit.walkMinutes });
  }

  const school: NearbySchool | undefined = nearest(enrichment.schools);
  if (school) {
    items.push({ kind: 'school', name: school.name, walkMinutes: school.walkMinutes });
  }

  const groceryPlace: NearbyPlace | undefined = nearest(
    enrichment.places.filter((place) => place.category === 'grocery'),
  );
  const grocery = enrichment.summary.nearestGrocery ?? groceryPlace;
  if (grocery) {
    items.push({ kind: 'grocery', name: grocery.name, walkMinutes: grocery.walkMinutes });
  }

  return items;
}
