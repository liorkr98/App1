import type { APIRoute } from 'astro';

import { activeProvider } from '@/features/billing/provider';

import { supabaseService } from '../../../lib/supabase-service';

export const prerender = false;

/**
 * The payments webhook (docs/PRICING.md §5: webhooks are the source of truth
 * for payment state).
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The provider adapter verifies the request with the
 * provider's own signature; only a verified, well-formed event reaches
 * `apply_payment_event`, which is idempotent on the transaction id, so a
 * replay changes nothing. With no PSP signed the adapter is `unset` and
 * this answers 503 to everything: there is no path here that marks anyone
 * paid without a provider saying so.
 * ======================================================================
 *
 * The body is never logged: it can carry a name or a phone number.
 */
export const POST: APIRoute = async ({ request }) => {
  const provider = activeProvider();
  if (provider.name === 'unset') {
    return json({ error: 'no_provider' }, 503);
  }

  const event = await provider.verifyWebhook(request).catch(() => null);
  if (!event) return json({ error: 'not_verified' }, 401);

  const client = supabaseService();
  if (!client) return json({ error: 'not_configured' }, 503);

  const { data, error } = await client.rpc('apply_payment_event', {
    p_txn_ref: event.txnRef,
    p_kind: event.kind,
    p_account: event.accountId,
    p_plan: event.planKey,
    p_listing: event.listingId ?? null,
    p_amount_agorot: event.amountAgorot ?? null,
    p_source: event.source ?? null,
  });

  if (error) {
    console.warn(`payments_webhook apply_failed ${error.code ?? 'unknown'}`);
    // 500 so the provider retries; the ledger makes the retry safe.
    return json({ error: 'apply_failed' }, 500);
  }
  return json({ ok: true, outcome: data }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
