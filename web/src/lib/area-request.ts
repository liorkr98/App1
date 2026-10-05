import { supabase } from './supabase';

/**
 * Asks /api/area to look up and store the surroundings of one listing.
 *
 * The editor calls this when the address is saved and again just before
 * publish, so a listing has its neighbourhood — and its map — without the
 * agent ever pressing "הצע תיאור". Nothing waits on it for long and nothing
 * fails over it: a busy OpenStreetMap minute gets one later retry, and after
 * that the description simply has no neighbourhood paragraph.
 */
export interface AreaAnswer {
  places: boolean;
  pending: boolean;
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
    const body = (await response.json()) as { places?: unknown; pending?: unknown };
    return { places: body.places === true, pending: body.pending === true };
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
