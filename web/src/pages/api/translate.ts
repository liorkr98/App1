import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { parseTranslation, translationInput, translationSource, translationSystem, type TranslationSource } from '@/features/listings/translate';

import { deepseekJson } from '../../lib/deepseek';
import { isPageLang } from '../../lib/i18n';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

export const prerender = false;

/**
 * POST /api/translate {listingId, lang} — the agent's own listing text in
 * English, Russian or Arabic, for them to read and edit in /mine before it is
 * saved (migration 0044). Nothing is saved here.
 *
 * The listing is read with the agent's own token, so RLS decides that it is
 * theirs; another agent's id reads as not found. Only the seller's text goes
 * to DeepSeek: the title, the description, a price note and the disclosures.
 * An answer that drops or changes a number is refused (features/listings/
 * translate.ts), not handed to the agent as if it were right.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'unavailable' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let listingId = '';
  let language: unknown;
  try {
    const body = (await request.json()) as { listingId?: unknown; lang?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
    language = body.lang;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || !isPageLang(language)) return json({ error: 'bad_request' }, 400);

  const { data, error } = await supabaseAsUser(token)
    .from('listings')
    .select('title, description, price_note, disclosures')
    .eq('id', listingId)
    .maybeSingle();
  if (error || !data) return json({ error: 'not_found' }, 404);
  const row = data as { title: string; description: string | null; price_note: string | null; disclosures: string[] | null };
  const source: TranslationSource = {
    title: row.title,
    description: row.description ?? '',
    ...(row.price_note ? { priceNote: row.price_note } : {}),
    ...(row.disclosures && row.disclosures.length > 0 ? { disclosures: row.disclosures } : {}),
  };

  const apiKey = typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY : '';
  if (!apiKey) return json({ error: 'no_key' }, 503);
  const answer = await deepseekJson({
    apiKey,
    system: translationSystem(language),
    user: translationInput(source),
    maxTokens: 2400,
    timeoutMs: 40_000,
  });
  if (!answer.ok) return json({ error: answer.reason === 'timeout' ? 'timeout' : 'unavailable' }, 502);
  const result = parseTranslation(answer.content, source);
  if (!result.ok) return json({ error: result.error }, 502);
  return json({ draft: result.draft, source: translationSource(source) }, 200);
};
