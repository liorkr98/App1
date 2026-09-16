import type { APIRoute } from 'astro';
// The Worker's own environment, which is where a Cloudflare secret lives.
// See web/src/cloudflare.d.ts for why it is read this way and not another.
import { env } from 'cloudflare:workers';

import {
  acceptDescription,
  descriptionPrompt,
  DESCRIPTION_SYSTEM_PROMPT,
  groundedDescription,
  type ListingCopyInput,
} from '@/features/listings/listing-copy';
import { parseEnrichmentBlock } from '@/features/listings/enrichment-payload';
import { LISTING_CATEGORIES, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { deepseekParagraph } from '../../lib/deepseek';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/description — the suggested Hebrew description for one listing.
 *
 * WHY A SERVER ROUTE. The model key is a secret and the editor is a browser.
 * Those two facts decide the shape entirely: the island sends a listing id and
 * its own access token, and the Worker holds the key.
 *
 * WHAT IT IS ALLOWED TO SAY is decided in `src/features/listings/` — the
 * prompt, the grounding rules and the fallback paragraph are all shared domain
 * code with tests. This file is transport: authenticate, load the row the
 * agent owns, ask, check, answer.
 *
 * THE FACTS COME FROM THE DATABASE, NOT THE REQUEST BODY. A client that sends
 * its own facts can ask the model to describe a flat that does not exist, and
 * the grounding check would pass because it would be checked against the same
 * invented list. The row is the only thing that can ground its own
 * description.
 *
 * NOT A PAGE-RENDER FETCH. CLAUDE.md §12 forbids querying an external source
 * when a listing page renders, and this is not that: it runs when an agent
 * presses a button in the editor, the result is stored on their row like any
 * other field they typed, and the published page reads only from us.
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

/** The area paragraph, when the proximity job has run for this listing. */
async function areaNote(
  client: ReturnType<typeof supabaseAsUser>,
  listingId: string,
): Promise<string | undefined> {
  try {
    const { data } = await client
      .from('listing_enrichment')
      .select('payload')
      .eq('listing_id', listingId)
      .maybeSingle();

    const parsed = parseEnrichmentBlock((data as { payload?: unknown } | null)?.payload);
    const note =
      parsed?.category === 'property' ? parsed.neighborhoodNote?.text : undefined;
    return note?.trim() ? note : undefined;
  } catch {
    // Enrichment is optional and usually absent — the proximity job is not on
    // the publish path yet (docs/INGEST.md). A missing area paragraph means a
    // shorter description, not a failed request.
    return undefined;
  }
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
    .select('id, category, facts, location, description')
    .eq('id', listingId)
    .maybeSingle();

  if (error) return json({ error: 'unavailable' }, 502);
  if (!data) return json({ error: 'not_found' }, 404);

  const row = data as {
    category?: unknown;
    facts?: unknown;
    location?: unknown;
    description?: unknown;
  };
  if (!isCategory(row.category)) return json({ error: 'not_found' }, 404);

  const city =
    typeof row.location === 'object' &&
    row.location !== null &&
    typeof (row.location as { city?: unknown }).city === 'string'
      ? ((row.location as { city: string }).city.trim() || undefined)
      : undefined;

  const note = await areaNote(client, listingId);

  const input: ListingCopyInput = {
    category: row.category,
    facts: Array.isArray(row.facts) ? (row.facts as Fact[]) : [],
    ...(city ? { city } : {}),
    ...(note ? { areaNote: note } : {}),
  };

  const apiKey = env.DEEPSEEK_API_KEY;

  if (apiKey) {
    const raw = await deepseekParagraph({
      apiKey,
      system: DESCRIPTION_SYSTEM_PROMPT,
      user: descriptionPrompt(input),
    });
    const accepted = raw ? acceptDescription(raw, input) : undefined;
    if (accepted) return json({ text: accepted, source: 'model' }, 200);
  }

  // No key, a refused reply, or one that failed grounding. The paragraph built
  // from the seller's own answers is the answer either way.
  const grounded = groundedDescription(input);
  if (!grounded.trim()) return json({ error: 'no_facts' }, 409);

  return json({ text: grounded, source: 'facts' }, 200);
};
