import type { APIRoute } from 'astro';
// The Worker's own environment, which is where a Cloudflare secret lives.
// See web/src/cloudflare.d.ts for why it is read this way and not another.
import { env } from 'cloudflare:workers';

import {
  acceptAgentDescription,
  AGENT_SYSTEM_PROMPT,
  agentPrompt,
  nextAgentDescription,
  type AgentCopyInput,
} from '@/features/listings/agent-copy';
import {
  acceptDescription,
  appendRewrite,
  appendTone,
  descriptionPrompt,
  isCopyTone,
  type CopyTone,
  DESCRIPTION_SYSTEM_PROMPT,
  groundedDescription,
  sameParagraph,
  type ListingCopyInput,
} from '@/features/listings/listing-copy';
import { LISTING_CATEGORIES, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { ensureAreaPlaces } from '../../lib/area-lookup';
import { deepseekParagraph, deepseekParagraphStreaming } from '../../lib/deepseek';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/description — the suggested Hebrew description for one listing.
 *
 * A FLAT IS DESCRIBED THE WAY AN AGENT WRITES IT (5 Oct 2026): opening, the
 * apartment, the building, the neighbourhood with routed walking minutes, a
 * closing line — agent-copy.ts. The surroundings come from the same cache
 * /api/area fills (lib/area-lookup.ts), so a listing whose address was saved
 * already has them and this press costs no Overpass query. A car keeps the
 * one-paragraph writer in listing-copy.ts; it has no neighbourhood.
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
 * The answer is `{ text, source, reason?, areaPending }`. `source` is 'model'
 * or 'facts' (no model involved), and when it is 'facts' `reason` says why:
 * `no_key` (DEEPSEEK_API_KEY is not set on the Worker), `no_answer` (timeout
 * or provider error), `rejected` (the reply failed a grounding check) or
 * `repeated` (it matched the text already in the box). The editor shows it,
 * because "the AI wrote this" and "the AI never ran" read the same otherwise.
 *
 * A second press sends the previous text, and the answer is never that text
 * again: the model is told to rephrase and a repeat is refused, and the
 * fallback moves on to its next variant. No facts at all is `no_facts` — the
 * box stays empty for the agent.
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

/** Why the text is not the model's. Absent when it is. */
type FallbackReason = 'no_key' | 'no_answer' | 'rejected' | 'repeated';

interface ModelCall {
  apiKey: string | undefined;
  system: string;
  user: string;
  /** The reply admitted, or why not. */
  check: (raw: string) => string | 'rejected' | 'repeated';
  fallback: Record<string, unknown>;
  stream: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

const isReason = (value: string): value is 'rejected' | 'repeated' =>
  value === 'rejected' || value === 'repeated';

async function modelText(call: ModelCall): Promise<Response> {
  const fallbackFor = (reason: FallbackReason) => ({ ...call.fallback, reason });
  const settle = (raw: string | undefined) => {
    if (!raw) return fallbackFor('no_answer');
    const checked = call.check(raw);
    return isReason(checked) ? fallbackFor(checked) : { ...call.fallback, text: checked, source: 'model' };
  };

  if (!call.apiKey) {
    const answer = fallbackFor('no_key');
    return call.stream ? sse(async (send) => send('done', answer)) : json(answer, 200);
  }

  const request = {
    apiKey: call.apiKey,
    system: call.system,
    user: call.user,
    ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
    ...(call.maxTokens === undefined ? {} : { maxTokens: call.maxTokens }),
    ...(call.timeoutMs === undefined ? {} : { timeoutMs: call.timeoutMs }),
  };

  if (call.stream) {
    return sse(async (send) => {
      send('status', { phase: 'model' });
      const raw = await deepseekParagraphStreaming(request, (token) => send('token', { t: token }));
      send('done', settle(raw));
    });
  }

  return json(settle(await deepseekParagraph(request)), 200);
}

function isCategory(value: unknown): value is ListingCategory {
  return typeof value === 'string' && (LISTING_CATEGORIES as string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let listingId = '';
  let previous = '';
  let tone: CopyTone = 'pro';
  try {
    const body = (await request.json()) as { listingId?: unknown; previous?: unknown; tone?: unknown };
    if (isCopyTone(body.tone)) tone = body.tone;
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
    : {}) as { city?: unknown };
  const city = asString(location.city);

  const apiKey = env.DEEPSEEK_API_KEY;
  const stream = wantsStream(request);

  const facts = Array.isArray(row.facts) ? (row.facts as Fact[]) : [];
  const again = previous !== '';
  const notRepeated = (text: string): string | 'repeated' =>
    again && sameParagraph(text, previous) ? 'repeated' : text;

  // -------------------------------------------------------------------- a car
  if (row.category !== 'property') {
    const input: ListingCopyInput = { category: row.category, facts, ...(city ? { city } : {}) };
    const grounded = groundedDescription(input, { alternate: again, tone });
    if (!grounded.trim()) return json({ error: 'no_facts' }, 409);

    return modelText({
      apiKey,
      system: DESCRIPTION_SYSTEM_PROMPT,
      user: appendRewrite(appendTone(descriptionPrompt(input), tone), previous),
      check: (raw) => {
        const accepted = acceptDescription(raw, input);
        return accepted ? notRepeated(accepted) : 'rejected';
      },
      fallback: { text: grounded, source: 'facts', area: true, areaPending: false },
      stream,
      ...(again ? { temperature: 0.85 } : {}),
    });
  }

  // ------------------------------------------------------------------- a flat
  //
  // The surroundings, from the row's cache or looked up now (one path with
  // /api/area). `pending` means OpenStreetMap did not answer in time: the
  // text is written without a neighbourhood and the editor asks once more in
  // a moment, when a second attempt usually lands.
  const { places, pending } = await ensureAreaPlaces(client, listingId, row);

  const input: AgentCopyInput = {
    category: row.category,
    facts,
    ...(city ? { city } : {}),
    ...(places ? { places } : {}),
  };

  const fallbackText = nextAgentDescription(input, previous, tone);
  // Nothing to say about the property: the editor keeps the box empty.
  if (!fallbackText.trim()) return json({ error: 'no_facts' }, 409);

  return modelText({
    apiKey,
    system: AGENT_SYSTEM_PROMPT,
    user: appendRewrite(appendTone(agentPrompt(input), tone), previous),
    check: (raw) => {
      const accepted = acceptAgentDescription(raw, input);
      return accepted ? notRepeated(accepted) : 'rejected';
    },
    fallback: { text: fallbackText, source: 'facts', area: places !== undefined, areaPending: pending },
    stream,
    temperature: again ? 0.85 : 0.5,
    maxTokens: 900,
    timeoutMs: 30_000,
  });
};
