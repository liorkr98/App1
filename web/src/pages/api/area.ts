import type { APIRoute } from 'astro';
import { waitUntil } from 'cloudflare:workers';

import { coarseSunPoint } from '@/features/sun/anchor';

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
 * Answers `{ ok, status, places, pending }` (statuses in area-lookup.ts).
 *
 * THE LOOKUP OUTLIVES THE REQUEST (7 Oct 2026). Three Overpass instances at
 * twelve seconds each can take longer than an agent waits at publish, and the
 * row write used to be the last step of a request the browser had already
 * left — so a listing went live with no map at all. Now the lookup is handed
 * to `waitUntil`, which keeps the Worker running until the row is written, and
 * the answer comes back after at most ANSWER_WITHIN_MS. If the lookup is still
 * going by then the answer is `working`; asking again reads the stored result.
 */
const ANSWER_WITHIN_MS = 25_000;
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
  if (row.category !== 'property') return json({ ok: true, status: 'no_address', places: false, pending: false }, 200);

  const lookup = ensureAreaPlaces(client, listingId, row);
  try {
    waitUntil(lookup.catch(() => undefined));
  } catch {
    // Outside a Worker (astro dev): the await below is all there is.
  }

  const result = await Promise.race([
    lookup.catch(() => undefined),
    new Promise<'working'>((resolve) => setTimeout(() => resolve('working'), ANSWER_WITHIN_MS)),
  ]);
  if (result === 'working') return json({ ok: true, status: 'working', places: false, pending: true }, 200);
  if (!result) return json({ ok: true, status: 'failed', places: false, pending: true }, 200);

  const { places, status, pending, origin } = result;
  // Rounded before it reaches the browser. The preview draws a sun table
  // from this and never prints the point.
  const sun = origin ? coarseSunPoint(origin.lat, origin.lon) : undefined;
  return json(
    {
      ok: true,
      status,
      places: places !== undefined,
      pending,
      // The agent's own row, read under their own token: the editor's preview
      // draws the map and the Walk route from it without a second request.
      ...(places ? { areaPlaces: places } : {}),
      ...(sun ? { sun } : {}),
    },
    200,
  );
};
