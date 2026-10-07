/**
 * Navigation links for the location section.
 *
 * The drawn "pin on plaster" card that used to live here is gone (7 Oct
 * 2026): a pin on nothing read as "this building" on a page whose rule is the
 * street area only. Without a looked-up neighbourhood the section is now the
 * street line alone (MapSection.astro).
 */

import type { ListingLocation } from '../../types/listing.js';

import { locationPrecision } from './control-surface.js';

export function wazeNavigateUrl(lat: number, lng: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function googleMapsUrl(lat: number, lng: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Where the navigation links point.
 *
 * `area` sends nothing — a neighbourhood is not a pin. `street` and `exact`
 * use the stored coordinate. That coordinate is the street midpoint unless
 * the agent chose exact; we do not keep a second, more precise point.
 */
export function navigationTarget(
  location: ListingLocation,
): { lat: number; lng: number } | undefined {
  if (locationPrecision(location) === 'area') return undefined;
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') return undefined;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return undefined;
  return { lat: location.lat, lng: location.lng };
}
