import type { APIRoute } from 'astro';
// The Worker's own environment, which is where a Cloudflare secret lives.
// See web/src/cloudflare.d.ts for why it is read this way and not another.
import { env } from 'cloudflare:workers';

import {
  allPlaces,
  hasPlaces,
  type AreaPlace,
  type AreaPlaces,
} from '@/features/listings/area-note';
import {
  acceptDescription,
  appendRewrite,
  descriptionPrompt,
  DESCRIPTION_SYSTEM_PROMPT,
  groundedDescription,
  sameParagraph,
  type ListingCopyInput,
} from '@/features/listings/listing-copy';
import { LISTING_CATEGORIES, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { deepseekParagraph, deepseekParagraphStreaming } from '../../lib/deepseek';
import { addressForQuery, areaPlaces } from '../../lib/overpass';
import { walkMinutes } from '../../lib/routing';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/description — the suggested Hebrew description for one listing.
 *
 * The paragraph is about the property: rooms, condition, light, layout.
 * Surroundings stay on the map. The address is still looked up, and the
 * named places are stored on the row for that map, but they are not
 * handed to the model.
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
 * The answer is the property paragraph (source: 'model', or 'facts' when
 * the model is absent or rejected). A second press sends the previous
 * paragraph so the next one is a different wording of the same facts.
 * No facts at all is `no_facts` — the box stays empty for the agent.
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

function wantsStream(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/event-stream');
}

type Send = (event: string, data: unknown) => void;

function sse(run: (send: Send) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: Send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await run(send);
      } catch {
        send('done', { error: 'unavailable' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function modelText(
  apiKey: string | undefined,
  system: string,
  user: string,
  accept: (raw: string) => string | undefined,
  fallback: Record<string, unknown>,
  successSource: string,
  stream: boolean,
  temperature?: number,
): Promise<Response> {
  const succeed = (text: string) => ({ ...fallback, text, source: successSource });

  if (!apiKey) {
    return stream ? sse(async (send) => send('done', fallback)) : json(fallback, 200);
  }

  if (stream) {
    return sse(async (send) => {
      send('status', { phase: 'model' });
      const raw = await deepseekParagraphStreaming(
        { apiKey, system, user, ...(temperature === undefined ? {} : { temperature }) },
        (token) => send('token', { t: token }),
      );
      const accepted = raw ? accept(raw) : undefined;
      send('done', accepted ? succeed(accepted) : fallback);
    });
  }

  const raw = await deepseekParagraph({
    apiKey,
    system,
    user,
    ...(temperature === undefined ? {} : { temperature }),
  });
  const accepted = raw ? accept(raw) : undefined;
  if (accepted) return json(succeed(accepted), 200);
  return json(fallback, 200);
}

function isCategory(value: unknown): value is ListingCategory {
  return typeof value === 'string' && (LISTING_CATEGORIES as string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The same places with routed walking minutes attached, where a router had an
 * answer.
 *
 * One matrix request for every place at once. A router that is not configured,
 * or does not answer, leaves every `walkMinutes` undefined — which renders as
 * no time at all rather than as a guess (CLAUDE.md §2).
 */
async function withWalkMinutes(
  places: AreaPlaces | undefined,
): Promise<AreaPlaces | undefined> {
  if (!places?.origin) return places;

  const flat = allPlaces(places);
  if (flat.length === 0) return places;

  const minutes = await walkMinutes(places.origin, flat);
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
  let previous = '';
  try {
    const body = (await request.json()) as { listingId?: unknown; previous?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
    previous = typeof body.previous === 'string' ? body.previous.trim() : '';
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
  const stream = wantsStream(request);

  // ---------------------------------------------------------------- the area
  //
  // The normalised address is the cache key as well as the query. Comparing a
  // stored `סוקולוב` against a raw `סוקולוב 12` never matches, and every press
  // of the button then queried Overpass again.
  const where = city && street ? addressForQuery(city, street) : undefined;

  if (where) {
    const cached = cachedPlaces(row.area_places, where);
    const places = cached ?? (await areaPlaces(where.city, where.street));

    const routed = cached ? places : await withWalkMinutes(places);

    if (routed && hasPlaces(routed)) {
      const places = routed;
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

      // The places stay on the row for the map. They do not become the
      // description — that paragraph is about the property.
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

  const again = previous !== '';
  const grounded = groundedDescription(input, { alternate: again });
  // Nothing to say about the property: the editor keeps the box empty.
  if (!grounded.trim()) return json({ error: 'no_facts' }, 409);

  return modelText(
    apiKey,
    DESCRIPTION_SYSTEM_PROMPT,
    appendRewrite(descriptionPrompt(input), previous),
    (raw) => {
      const accepted = acceptDescription(raw, input);
      if (!accepted) return undefined;
      return again && sameParagraph(accepted, previous) ? undefined : accepted;
    },
    { text: grounded, source: 'facts', areaPending },
    'model',
    stream,
    again ? 0.85 : undefined,
  );
};
