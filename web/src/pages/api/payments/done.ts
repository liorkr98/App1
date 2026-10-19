import type { APIRoute } from 'astro';

import { confirmPayment, resultParams } from '../../../lib/payment-confirm';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where Tranzila's window goes after the payment (success_url_address and
 * fail_url_address), inside the frame on /pay/.
 *
 * It confirms the payment the same way the notification does
 * (confirmPayment), so a notification that is late or lost does not leave
 * an agent who paid without their plan. A card token in this address is
 * ignored: it came through a browser. Then it sends the frame to /pay/done/
 * with only the session id, so nothing from Tranzila stays in the address
 * bar or the history. HUMAN REVIEW, CLAUDE.md §8.
 */
const handle: APIRoute = async ({ request }) => {
  const params = await resultParams(request);
  const session = params.get('s') ?? params.get('ls_session') ?? '';
  const sessionId = UUID.test(session) ? session.toLowerCase() : '';

  let state = 'failed';
  if (params.get('failed') !== '1') {
    const result = await confirmPayment(params, false);
    state = result.status === 'paid' || result.status === 'duplicate' ? 'paid' : result.status === 'unavailable' ? 'pending' : 'failed';
  }

  const to = new URL('/pay/done/', request.url);
  if (sessionId) to.searchParams.set('s', sessionId);
  to.searchParams.set('r', state);
  return new Response(null, { status: 303, headers: { Location: to.pathname + to.search, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
};

export const GET = handle;
export const POST = handle;
