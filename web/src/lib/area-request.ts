import { supabase } from './supabase';

/**
 * Asks /api/area to look up and store the surroundings of one listing.
 *
 * The editor calls this as soon as the listing exists with a city and street,
 * again whenever the address changes, and keeps asking (with backoff) until
 * the answer is settled. Asking again is cheap: once the row holds the places,
 * the server answers from the row without touching OpenStreetMap.
 */

/** As /api/area answers, plus `working` while the server is still looking. */
export type AreaClientStatus = 'ready' | 'none' | 'no_address' | 'not_found' | 'failed' | 'working';

export interface AreaAnswer {
  status: AreaClientStatus;
  places: boolean;
  pending: boolean;
  /** The stored surroundings when `ready`, for the preview. */
  areaPlaces?: unknown;
  /** Coarse sun anchor, already rounded. Absent when the street has no point. */
  sun?: { lat: number; lng: number };
}

const STATUSES: readonly AreaClientStatus[] = ['ready', 'none', 'no_address', 'not_found', 'failed', 'working'];

/** An answer that no amount of asking again will change. */
export function areaSettled(status: AreaClientStatus | undefined): boolean {
  return status === 'ready' || status === 'none' || status === 'no_address' || status === 'not_found';
}

export async function requestArea(listingId: string): Promise<AreaAnswer | undefined> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return undefined;

    const response = await fetch('/api/area', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ listingId }),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      status?: unknown;
      places?: unknown;
      pending?: unknown;
      areaPlaces?: unknown;
      sun?: unknown;
    };
    const sun = body.sun;
    const point =
      typeof sun === 'object' && sun !== null
        ? { lat: Number((sun as { lat?: unknown }).lat), lng: Number((sun as { lng?: unknown }).lng) }
        : undefined;
    const status = STATUSES.includes(body.status as AreaClientStatus)
      ? (body.status as AreaClientStatus)
      : body.places === true
        ? 'ready'
        : 'failed';
    return {
      status,
      places: body.places === true,
      pending: body.pending === true,
      ...(body.areaPlaces !== undefined ? { areaPlaces: body.areaPlaces } : {}),
      ...(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? { sun: point } : {}),
    };
  } catch {
    return undefined;
  }
}

/** The address an answer is for, so one address is looked up once. */
export function areaKey(city: string | undefined, street: string | undefined): string | undefined {
  const c = city?.trim() ?? '';
  const s = street?.trim() ?? '';
  return c && s ? `${c}|${s}` : undefined;
}
