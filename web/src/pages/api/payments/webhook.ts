import type { APIRoute } from 'astro';

import { confirmPayment, resultParams } from '../../../lib/payment-confirm';

export const prerender = false;

/**
 * Tranzila's notification (notify_url_address), server to server.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The notification is not signed, so nothing in it is
 * believed: confirmPayment asks Tranzila about the transaction with our
 * API keys and gives a plan only when Tranzila confirms it, for the
 * session's amount and the session's id. Without Tranzila set up this
 * answers 503 to everything.
 * ======================================================================
 *
 * Answers: 200 "OK" when the payment is applied or already was; 400 when
 * it is not ours or does not hold (Tranzila need not send it again); 503
 * when Tranzila or the database could not answer, so it is sent again.
 * The body is never logged.
 */
export const POST: APIRoute = async ({ request }) => {
  const result = await confirmPayment(await resultParams(request), true);
  if (result.status === 'paid' || result.status === 'duplicate') return text('OK', 200);
  if (result.status === 'refused') return text('refused', 400);
  return text('unavailable', 503);
};

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
