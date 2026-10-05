import { ASPECT_BEARING } from './sun.js';

/**
 * Where the Heliograph sun is computed from.
 *
 * The page never receives a precise point (CLAUDE.md §7, the stage comment).
 * Coordinates are rounded to 0.1° — about 11 km — before any sun table is
 * built, and the HTML only gets that table. A street midpoint from the area
 * lookup is enough; a listing with no aspect, or no point at all, has no sun.
 */

export interface SunAnchor {
  lat: number;
  lng: number;
  /** Compass degrees the balcony faces. 0 is north. */
  facing: number;
  /** True when the point is a street or a town, not a front door. */
  approx: boolean;
}

/** Israel, loosely. A point outside it is not a listing we can draw a sun for. */
function inIsrael(lat: number, lng: number): boolean {
  return lat >= 29 && lat <= 34 && lng >= 34 && lng <= 36.5;
}

/** 0.1° — the only precision the sun page is allowed to use. */
export function coarseSunPoint(lat: number, lng: number): { lat: number; lng: number } | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (!inIsrael(lat, lng)) return undefined;
  return { lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 };
}

/** A stored area-lookup origin, or a preview payload, as a coarse sun point. */
export function coarseOrigin(value: unknown): { lat: number; lng: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const origin = (value as { origin?: unknown }).origin ?? value;
  if (typeof origin !== 'object' || origin === null) return undefined;
  const lat = Number((origin as { lat?: unknown }).lat);
  const lon = (origin as { lon?: unknown; lng?: unknown }).lon ?? (origin as { lng?: unknown }).lng;
  return coarseSunPoint(lat, Number(lon));
}

function facingOf(value: string): number | undefined {
  const key = value.trim().replace(/[-–—]/g, '\u05BE');
  return ASPECT_BEARING[key];
}

/**
 * The sun's anchor for one listing.
 *
 * An exact pin wins. Otherwise the street midpoint the area lookup stored
 * (`areaPlaces.origin`) — the editor never writes coordinates onto the
 * listing, so without this a real page has no sun at all. Rounded either way.
 */
export function sunAnchor(input: {
  facts: readonly { key: string; value: unknown; present?: boolean }[];
  location?: { lat?: number; lng?: number; street?: string; precision?: 'exact' | 'street' | 'area' };
  origin?: { lat: number; lon: number };
}): SunAnchor | undefined {
  const aspect = input.facts.find(
    (fact) =>
      fact.key === 'aspect' &&
      fact.present !== false &&
      typeof fact.value === 'string' &&
      fact.value.trim() !== '',
  );
  const facing = typeof aspect?.value === 'string' ? facingOf(aspect.value) : undefined;
  if (facing === undefined) return undefined;

  const lat = input.location?.lat;
  const lng = input.location?.lng;
  if (lat !== undefined && lng !== undefined) {
    const coarse = coarseSunPoint(lat, lng);
    if (!coarse) return undefined;
    const approx = input.location?.precision === 'area' || !input.location?.street;
    return { ...coarse, facing, approx };
  }

  if (!input.origin) return undefined;
  const coarse = coarseSunPoint(input.origin.lat, input.origin.lon);
  if (!coarse) return undefined;
  return { ...coarse, facing, approx: true };
}
