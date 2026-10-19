import type { APIRoute } from 'astro';

import { handshake, randomHex, sha256Hex, windowUrl } from '@/features/billing/tranzila';

import { supabaseAsUser, supabaseConfigured } from '../../../lib/supabase';
import { supabaseService } from '../../../lib/supabase-service';
import { tranzilaEnv } from '../../../lib/tranzila-env';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What open_checkout (0049) refuses with, and what the page is told. */
const REFUSALS = new Set(['payments_off', 'test_only', 'unknown_plan', 'already_subscribed', 'cohort_full', 'not_your_listing', 'too_many']);

/**
 * POST /api/payments/checkout {plan, listingId?} — opens a Tranzila payment
 * window for the signed-in caller (0049, docs/PAYMENTS.md).
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. Who pays is the caller's verified token, never the body.
 * The amount is worked out by open_checkout from the plans table, and the
 * handshake locks it at Tranzila before the window opens, so a changed
 * address cannot pay less. Nothing here marks anyone paid.
 * ======================================================================
 */
export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) return json({ error: 'insecure' }, 400);

  const tranzila = tranzilaEnv();
  const client = supabaseService();
  if (!supabaseConfigured || !tranzila || !client) return json({ error: 'not_configured' }, 503);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);
  const { data: who, error: whoError } = await supabaseAsUser(token).auth.getUser(token);
  if (whoError || !who.user) return json({ error: 'unauthenticated' }, 401);

  let plan = '';
  let listingId: string | null = null;
  try {
    const body = (await request.json()) as { plan?: unknown; listingId?: unknown };
    plan = typeof body.plan === 'string' && /^[a-z_]{2,40}$/.test(body.plan) ? body.plan : '';
    if (typeof body.listingId === 'string' && UUID.test(body.listingId)) listingId = body.listingId;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!plan) return json({ error: 'bad_request' }, 400);

  const nonce = randomHex(32);
  const { data, error } = await client.rpc('open_checkout', {
    p_account: who.user.id,
    p_plan: plan,
    p_listing: listingId,
    p_nonce_hash: await sha256Hex(nonce),
  });
  if (error) {
    const reason = REFUSALS.has(error.message) ? error.message : 'unavailable';
    return json({ error: reason }, reason === 'unavailable' ? 502 : reason === 'too_many' ? 429 : 409);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { session_id?: string; amount_agorot?: number } | undefined;
  if (!row?.session_id || !row.amount_agorot) return json({ error: 'unavailable' }, 502);

  const thtk = await handshake(tranzila.config, row.amount_agorot, fetch);
  if (!thtk) return json({ error: 'provider_unavailable' }, 502);

  const { data: planRow } = await client.from('plans').select('kind').eq('key', plan).maybeSingle();
  const url = windowUrl(tranzila.config, {
    sessionId: row.session_id,
    nonce,
    amountAgorot: row.amount_agorot,
    thtk,
    keepToken: (planRow as { kind?: string } | null)?.kind === 'subscription',
    notifyUrl: `${origin}/api/payments/webhook`,
    doneUrl: `${origin}/api/payments/done?s=${row.session_id}`,
    description: `AmudSell ${plan}`,
  });
  return json({ sessionId: row.session_id, amountAgorot: row.amount_agorot, url }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
