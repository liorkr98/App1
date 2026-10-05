import type { APIRoute } from 'astro';

import { ensureAreaPlaces } from '../../lib/area-lookup';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/area — look up and store the surroundings of one listing.
 *
 * Called by the editor once the address is saved, and again at publish if the
 * stored surroundings are missing or for an older address. Before this, a
 * listing had a real neighbourhood (and a real map) only when the agent
 * pressed "הצע תיאור", because that was the only place the lookup ran.
 *
 * Same shape as /api/description: the island sends a listing id and its own
 * access token; RLS on `listings` is the authorisation — there is no owner
 * check written here, so that a second check cannot quietly become the
 * security the day somebody edits the policy. The address comes from the row,
 * never the request body.
 *
 * Answers `{ ok, places, pending }`. `pending` means OpenStreetMap did not
 * answer in time and one later retry is worthwhile; nothing ever fails the
 * editor over it.
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let listingId = '';
  try {
    const body = (await request.json()) as { listingId?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!listingId) return json({ error: 'bad_request' }, 400);

  const client = supabaseAsUser(token);
  const { data, error } = await client
    .from('listings')
    .select('id, category, location, area_places')
    .eq('id', listingId)
    .maybeSingle();

  if (error) return json({ error: 'unavailable' }, 502);
  if (!data) return json({ error: 'not_found' }, 404);

  const row = data as { category?: unknown; location?: unknown; area_places?: unknown };
  // A car's location is a meeting area, not an address (DESIGN-CONTRACT §5.4).
  if (row.category !== 'property') return json({ ok: true, places: false, pending: false }, 200);

  const { places, pending } = await ensureAreaPlaces(client, listingId, row);
  return json({ ok: true, places: places !== undefined, pending }, 200);
};
