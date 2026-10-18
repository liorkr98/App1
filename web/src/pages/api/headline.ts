import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { acceptHeadline, HEADLINE_SYSTEM_PROMPT, headlinePrompt } from '@/features/listings/headline';
import { appendTone, isCopyTone, type CopyTone } from '@/features/listings/listing-copy';
import { LISTING_CATEGORIES, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { deepseekJson } from '../../lib/deepseek';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/headline — DeepSeek suggests the page's title and the line the
 * WhatsApp message carries after it (18 Oct 2026). The owner asked for the
 * model to do more of the agent's typing.
 *
 * The same key and the same rule as the description: the key stays on the
 * Worker, and the facts are read from the row under the caller's own token
 * (RLS), never taken from the request. A part that breaks the copy rules
 * (headline.ts) is left out; no key or no answer is `{ reason }`, and the
 * editor simply offers nothing.
 *
 * NOT A PAGE-RENDER FETCH. The published page never calls this.
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const isCategory = (value: unknown): value is ListingCategory =>
  typeof value === 'string' && (LISTING_CATEGORIES as string[]).includes(value);

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let listingId = '';
  let tone: CopyTone = 'pro';
  try {
    const body = (await request.json()) as { listingId?: unknown; tone?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
    if (isCopyTone(body.tone)) tone = body.tone;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!listingId) return json({ error: 'bad_request' }, 400);

  const { data, error } = await supabaseAsUser(token)
    .from('listings')
    .select('category, facts, location')
    .eq('id', listingId)
    .maybeSingle();
  if (error) return json({ error: 'unavailable' }, 502);
  const row = data as { category?: unknown; facts?: unknown; location?: unknown } | null;
  if (!row || !isCategory(row.category)) return json({ error: 'not_found' }, 404);

  const facts = Array.isArray(row.facts) ? (row.facts as Fact[]) : [];
  const city = (row.location as { city?: unknown } | null)?.city;
  const input = {
    category: row.category,
    facts,
    ...(typeof city === 'string' && city.trim() ? { city: city.trim() } : {}),
  };

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return json({ reason: 'no_key' }, 200);

  const answer = await deepseekJson({
    apiKey,
    system: HEADLINE_SYSTEM_PROMPT,
    user: appendTone(headlinePrompt(input), tone),
    maxTokens: 300,
    timeoutMs: 20_000,
  });
  if (!answer.ok) return json({ reason: 'no_answer' }, 200);

  const accepted = acceptHeadline(answer.content, input);
  return json(Object.keys(accepted).length > 0 ? accepted : { reason: 'rejected' }, 200);
};
