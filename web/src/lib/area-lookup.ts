import type { SupabaseClient } from '@supabase/supabase-js';

import { allPlaces, hasPlaces, type AreaPlace, type AreaPlaces } from '@/features/listings/area-note';

import { addressForQuery, areaPlaces } from './overpass';
import { walkMinutes } from './routing';

/**
 * The surroundings of one listing: named places from OpenStreetMap with routed
 * walking minutes, cached on `listings.area_places`.
 *
 * ONE PATH FOR EVERY CALLER. This used to live inside the description route,
 * which meant a listing had surroundings — and a real map — only if the agent
 * happened to press "הצע תיאור". Now /api/area runs it when the address is
 * saved and at publish, and the description route reads the same cache.
 *
 * NOT A PAGE-RENDER FETCH (CLAUDE.md §12). It runs in the editor, on the
 * agent's own row; the published page reads only what was stored.
 */

/**
 * The same places with routed walking minutes attached, where a router had an
 * answer.
 *
 * One matrix request for every place at once. A router that is not configured,
 * or does not answer, leaves every `walkMinutes` undefined — which renders as
 * no time at all rather than as a guess (CLAUDE.md §2).
 */
export async function withWalkMinutes(
  places: AreaPlaces | undefined,
): Promise<AreaPlaces | undefined> {
  if (!places?.origin) return places;

  const flat = allPlaces(places);
  if (flat.length === 0) return places;

  const minutes = await walkMinutes(places.origin, flat);
  if (minutes.every((value) => value === undefined)) areaLog('routing_failed');
  const byName = new Map(flat.map((place, index) => [place.name, minutes[index]]));

  const timed = (group: readonly AreaPlace[]): AreaPlace[] =>
    group.map((place) => {
      const found = byName.get(place.name);
      return found === undefined ? place : { ...place, walkMinutes: found };
    });

  return {
    ...places,
    neighbourhoods: timed(places.neighbourhoods),
    schools: timed(places.schools),
    transit: timed(places.transit),
    parks: timed(places.parks),
    community: timed(places.community),
    shops: timed(places.shops),
  };
}

/**
 * Cached OSM names on the listing row, when they are still for this address.
 *
 * The seller presses the button more than once — to get a different paragraph,
 * or after editing a fact — and each press would otherwise be another query
 * against a service run on donations. A cache keyed to the address it was
 * fetched for also means changing the street correctly invalidates it.
 */
export function cachedPlaces(
  value: unknown,
  where: { city: string; street: string },
): AreaPlaces | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const cached = value as Partial<AreaPlaces>;
  if (cached.city !== where.city) return undefined;
  if (cached.street !== where.street) return undefined;

  const lists = ['neighbourhoods', 'schools', 'transit', 'parks', 'community', 'shops'] as const;
  if (!lists.every((key) => Array.isArray(cached[key]))) return undefined;

  return cached as AreaPlaces;
}

/**
 * What a lookup ended as. The editor shows the agent a line for each, and the
 * Worker logs every one that is not `ready` (Cloudflare Observability).
 *
 *   ready       places are stored on the row
 *   none        the street was found, nothing named around it
 *   no_address  no city or street to look up
 *   not_found   OpenStreetMap has no such street in that city, as spelled
 *   failed      no instance answered; worth retrying
 */
export type AreaStatus = 'ready' | 'none' | 'no_address' | 'not_found' | 'failed';

export interface AreaResult {
  /** The places, cached or freshly fetched; undefined when there are none. */
  places: AreaPlaces | undefined;
  status: AreaStatus;
  /** `failed`, kept as its own flag for callers that only ask "retry?". */
  pending: boolean;
  /**
   * The street midpoint, when the lookup has one. The sun template rounds it;
   * it is not a pin and it is not written onto location.
   */
  origin?: { lat: number; lon: number };
}

/**
 * One line per outcome worth knowing about, and never the address: a reason
 * code is enough to tell a busy Overpass from a misspelled street, and an
 * address in a log is personal data (CLAUDE.md §9).
 */
export function areaLog(code: string): void {
  console.warn(`area_lookup ${code}`);
}

/**
 * The surroundings for a listing row, fetching and storing them when the cache
 * is missing or is for another address.
 *
 * The write goes through the owner's own client and policy — it is their row.
 * A street with nothing named around it is stored too, so the next call does
 * not ask Overpass the same question again.
 */
export async function ensureAreaPlaces(
  client: SupabaseClient,
  listingId: string,
  row: { location?: unknown; area_places?: unknown },
  /**
   * `false` reads the cache and never asks Overpass. The description route
   * uses it: /api/area owns the lookup, and a second query racing it for the
   * same row only doubled the load on a donated service and held the
   * description back for up to half a minute.
   */
  options: { lookUp?: boolean } = {},
): Promise<AreaResult> {
  const location = (typeof row.location === 'object' && row.location !== null ? row.location : {}) as {
    city?: unknown;
    street?: unknown;
  };
  const city = typeof location.city === 'string' ? location.city.trim() : '';
  const street = typeof location.street === 'string' ? location.street.trim() : '';
  if (!city || !street) return { places: undefined, status: 'no_address', pending: false };

  const where = addressForQuery(city, street);
  if (!where) return { places: undefined, status: 'no_address', pending: false };

  const cached = cachedPlaces(row.area_places, where);
  if (cached) {
    const found = hasPlaces(cached);
    return {
      places: found ? cached : undefined,
      status: found ? 'ready' : 'none',
      pending: false,
      ...(cached.origin ? { origin: cached.origin } : {}),
    };
  }

  if (options.lookUp === false) return { places: undefined, status: 'failed', pending: true };

  const lookup = await areaPlaces(where.city, where.street);
  if (lookup.status === 'not_found') {
    areaLog('street_not_found');
    return { places: undefined, status: 'not_found', pending: false };
  }
  if (lookup.status === 'failed') {
    areaLog(`failed ${lookup.reason}`);
    return { places: undefined, status: 'failed', pending: true };
  }

  const routed = (await withWalkMinutes(lookup.places)) ?? lookup.places;
  const found = hasPlaces(routed);

  // Kept on the row so the next press costs nothing, so the published page can
  // draw the map, and so it carries the ODbL credit for text derived from
  // these names (CLAUDE.md §10).
  const { error } = await client.from('listings').update({ area_places: routed }).eq('id', listingId);
  if (error) {
    areaLog('write_failed');
    return { places: undefined, status: 'failed', pending: true };
  }
  if (!found) areaLog('none_named');
  return {
    places: found ? routed : undefined,
    status: found ? 'ready' : 'none',
    pending: false,
    ...(routed.origin ? { origin: routed.origin } : {}),
  };
}
