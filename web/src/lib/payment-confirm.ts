import { checkPayment, lookupTransaction, readHint, type SessionRow } from '@/features/billing/tranzila';
import { sealToken } from '@/features/billing/token-vault';

import { supabaseService } from './supabase-service';
import { tranzilaEnv } from './tranzila-env';

export type Confirmed =
  | { status: 'paid' | 'duplicate'; sessionId: string }
  | { status: 'refused'; sessionId?: string; reason: string }
  | { status: 'unavailable'; sessionId?: string };

/**
 * Turns a payment result into a plan, if and only if Tranzila confirms it
 * (src/features/billing/tranzila.ts checkPayment). Two callers:
 *
 *   /api/payments/webhook  Tranzila's notification, server to server. Its
 *                          card token is trusted (trustToken).
 *   /api/payments/done     the window's return, through the browser. Its
 *                          token, if any, is ignored.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The account and the plan come from OUR session row, never
 * from the result. complete_checkout (0049) is idempotent on the
 * transaction, so the two callers can arrive in either order, or twice.
 * ======================================================================
 *
 * Never logs the result: it can carry a name or card digits.
 */
export async function confirmPayment(params: URLSearchParams, trustToken: boolean): Promise<Confirmed> {
  const hint = readHint(params);
  if (!hint) return { status: 'refused', reason: 'unreadable' };

  const tranzila = tranzilaEnv();
  const client = supabaseService();
  if (!tranzila || !client) return { status: 'unavailable', sessionId: hint.sessionId };

  const { data, error } = await client
    .from('checkout_sessions')
    .select('id, account_id, amount_agorot, nonce_hash, status')
    .eq('id', hint.sessionId)
    .maybeSingle();
  if (error) return { status: 'unavailable', sessionId: hint.sessionId };
  const session = data as (SessionRow & { account_id: string; status: string }) | null;
  if (!session) return { status: 'refused', reason: 'unknown_session' };

  // The session and its nonce first, from our own row: a result that is not
  // for a session we opened never costs a call to Tranzila.
  const precheck = await checkPayment(session, hint, undefined, false);
  if (!precheck.ok && precheck.reason !== 'not_confirmed') {
    console.warn(`payment_confirm refused ${precheck.reason}`);
    return { status: 'refused', sessionId: session.id, reason: precheck.reason };
  }

  const record = await lookupTransaction(tranzila.config, hint.index, fetch);
  const verdict = await checkPayment(session, hint, record, trustToken);
  if (!verdict.ok) {
    console.warn(`payment_confirm refused ${verdict.reason}`);
    return verdict.reason === 'not_confirmed'
      ? { status: 'unavailable', sessionId: session.id }
      : { status: 'refused', sessionId: session.id, reason: verdict.reason };
  }

  let sealed: string | null = null;
  if (verdict.token) {
    try {
      sealed = await sealToken(verdict.token, session.account_id, tranzila.tokenKey);
    } catch {
      // A bad key is a setup fault: the plan is still given, the card is not kept.
      console.warn('payment_confirm token_not_sealed');
    }
  }

  const { data: outcome, error: applyError } = await client.rpc('complete_checkout', {
    p_session: session.id,
    // The terminal too: the test terminal and the live one number their
    // transactions separately.
    p_txn_ref: `tranzila:${tranzila.config.terminal}:${hint.index}`,
    p_amount_agorot: session.amount_agorot,
    p_token_sealed: sealed,
    p_exp_month: sealed ? (hint.expMonth ?? null) : null,
    p_exp_year: sealed ? (hint.expYear ?? null) : null,
    p_last4: sealed ? (hint.last4 ?? null) : null,
  });
  if (applyError) {
    console.warn(`payment_confirm apply_failed ${applyError.code ?? 'unknown'}`);
    // 22023 is a refusal the database made on purpose (a session paid by
    // another transaction, a transaction already used): asking again will
    // not change it. Anything else may pass on a retry.
    return applyError.code === '22023'
      ? { status: 'refused', sessionId: session.id, reason: 'apply_refused' }
      : { status: 'unavailable', sessionId: session.id };
  }
  return { status: outcome === 'duplicate' ? 'duplicate' : 'paid', sessionId: session.id };
}

/** A form body or a query string, whichever the caller sent. */
export async function resultParams(request: Request): Promise<URLSearchParams> {
  const params = new URLSearchParams(new URL(request.url).search);
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') ?? '';
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      const form = await request.formData().catch(() => null);
      form?.forEach((value, name) => {
        if (typeof value === 'string') params.set(name, value);
      });
    }
  }
  return params;
}
