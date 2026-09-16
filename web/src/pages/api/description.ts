import type { APIRoute } from 'astro';
// The Worker's own environment, which is where a Cloudflare secret lives.
// See web/src/cloudflare.d.ts for why it is read this way and not another.
import { env } from 'cloudflare:workers';

import {
  acceptAreaNote,
  areaNoteFromPlaces,
  AREA_SYSTEM_PROMPT,
  buildAreaPrompt,
  hasPlaces,
  OSM_ATTRIBUTION,
  type AreaPlaces,
} from '@/features/listings/area-note';
import {
  acceptDescription,
  descriptionPrompt,
  DESCRIPTION_SYSTEM_PROMPT,
  groundedDescription,
  type ListingCopyInput,
} from '@/features/listings/listing-copy';
import { LISTING_CATEGORIES, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { deepseekParagraph } from '../../lib/deepseek';
import { addressForQuery, areaPlaces } from '../../lib/overpass';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/description — the suggested Hebrew description for one listing.
 *
 * ===================== WHAT THE AGENT ASKED FOR =====================
 * "I want DeepSeek to write the description by the address — about the
 * neighbourhood, schools, transport, community. A few lines, not more."
 *
 * So the address is the input. The city and street go to OpenStreetMap, which
 * answers with the real named schools, bus stops, parks, community centres and
 * neighbourhood around that street, and those names are the only things the
 * model is allowed to write about. Everything it returns is checked back
 * against the list before the seller ever sees it.
 * ====================================================================
 *
 * WHY A SERVER ROUTE. The model key is a secret and the editor is a browser.
 * Those two facts decide the shape entirely: the island sends a listing id and
 * its own access token, and the Worker holds the key.
 *
 * THE FACTS COME FROM THE DATABASE, NOT THE REQUEST BODY. A client that sends
 * its own address could ask the model to describe a street it does not own a
 * listing on, and the grounding check would pass because it would be checked
 * against the same invented list. The row is the only thing that can ground
 * its own description.
 *
 * THREE ANSWERS, IN ORDER OF HOW MUCH THEY SAY:
 *
 *   area   the model's paragraph about the real neighbourhood     (source: 'area')
 *   places the same names, in plainer sentences, no model         (source: 'places')
 *   facts  the seller's own rooms/size/floor, when OSM knows
 *          nothing about the street or there is no city at all    (source: 'facts')
 *
 * Each step down is a normal outcome, not an error. A seller always gets
 * something they can edit, and nothing here waits on a provider being up.
 *
 * NOT A PAGE-RENDER FETCH (CLAUDE.md §12). This runs when an agent presses a
 * button in the editor, the result is stored on their row like any other field
 * they typed, and the published page reads only from us.
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function isCategory(value: unknown): value is ListingCategory {
  return typeof value === 'string' && (LISTING_CATEGORIES as string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Cached OSM names on the listing row, when they are still for this address.
 *
 * The seller presses the button more than once — to get a different paragraph,
 * or after editing a fact — and each press would otherwise be another query
 * against a service run on donations. A cache keyed to the address it was
 * fetched for also means changing the street correctly invalidates it.
 */
function cachedPlaces(
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

  /*
   * RLS is the authorisation. There is no owner check written here on purpose:
   * the select policy in 0002 already restricts this to the agent's own rows,
   * and a second check in this file would look like the security and quietly
   * become the security the day somebody edits the policy.
   */
  const { data, error } = await client
    .from('listings')
    .select('id, category, facts, location, area_places')
    .eq('id', listingId)
    .maybeSingle();

  if (error) return json({ error: 'unavailable' }, 502);
  if (!data) return json({ error: 'not_found' }, 404);

  const row = data as {
    category?: unknown;
    facts?: unknown;
    location?: unknown;
    area_places?: unknown;
  };
  if (!isCategory(row.category)) return json({ error: 'not_found' }, 404);

  const location = (typeof row.location === 'object' && row.location !== null
    ? row.location
    : {}) as { city?: unknown; street?: unknown };
  const city = asString(location.city);
  const street = asString(location.street);

  const apiKey = env.DEEPSEEK_API_KEY;

  // ---------------------------------------------------------------- the area
  //
  // The normalised address is the cache key as well as the query. Comparing a
  // stored `סוקולוב` against a raw `סוקולוב 12` never matches, and every press
  // of the button then queried Overpass again.
  const where = city && street ? addressForQuery(city, street) : undefined;

  if (where) {
    const cached = cachedPlaces(row.area_places, where);
    const places = cached ?? (await areaPlaces(where.city, where.street));

    if (places && hasPlaces(places)) {
      /*
       * Kept on the listing row so a second press costs nothing, and so the
       * published page can carry the ODbL credit for text derived from these
       * names (CLAUDE.md §10). Written under the owner's own policy — it is
       * their row — and a failure here is not worth failing the request for.
       */
      if (!cached) {
        await client
          .from('listings')
          .update({ area_places: places })
          .eq('id', listingId);
      }

      if (apiKey) {
        const raw = await deepseekParagraph({
          apiKey,
          system: AREA_SYSTEM_PROMPT,
          user: buildAreaPrompt(places),
        });
        const accepted = raw ? acceptAreaNote(raw, places) : undefined;
        if (accepted) {
          return json({ text: accepted, source: 'area', attribution: OSM_ATTRIBUTION }, 200);
        }
      }

      return json(
        {
          text: areaNoteFromPlaces(places),
          source: 'places',
          attribution: OSM_ATTRIBUTION,
        },
        200,
      );
    }
  }

  // ------------------------------------------------- the seller's own answers
  //
  // Reached either because there is no address to look up, or because OSM did
  // not answer in time. Those are different situations for the CLIENT: the
  // second one is worth asking about again in a moment, and `areaPending` is
  // how the editor knows which it got. Overpass is a public service and a busy
  // minute is normal; a second attempt usually lands.
  const areaPending = Boolean(where);

  const input: ListingCopyInput = {
    category: row.category,
    facts: Array.isArray(row.facts) ? (row.facts as Fact[]) : [],
    ...(city ? { city } : {}),
  };

  if (apiKey) {
    const raw = await deepseekParagraph({
      apiKey,
      system: DESCRIPTION_SYSTEM_PROMPT,
      user: descriptionPrompt(input),
    });
    const accepted = raw ? acceptDescription(raw, input) : undefined;
    if (accepted) return json({ text: accepted, source: 'model', areaPending }, 200);
  }

  const grounded = groundedDescription(input);
  if (!grounded.trim()) return json({ error: 'no_facts' }, 409);

  return json({ text: grounded, source: 'facts', areaPending }, 200);
};
