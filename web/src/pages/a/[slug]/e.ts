import type { APIRoute } from 'astro';

import { OWNER_COOKIE, isAutomated } from '@/features/analytics/count-rules';
import { isBeaconKind } from '@/features/analytics/events';

import { recordListingEvent } from '../../../lib/listing-events';

/**
 * The one event a listing page reports from the browser: scroll_75, sent
 * once when the buyer has read down to the agent block.
 *
 * POST, body = the kind as plain text (navigator.sendBeacon's default).
 * Anything but a beacon kind is refused — a client must never be able to
 * report views or WhatsApp taps, or a loop could inflate an agent's numbers
 * (src/features/analytics/events.ts). Always answers 204: the page never
 * waits on this and has nothing to do with the result.
 */
export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const kind = (await request.text().catch(() => '')).trim();
  // The agent reading their own page, or automation, is not a buyer reading
  // to the end (count-rules.ts).
  const own = (request.headers.get('cookie') ?? '').split(';').some((part) => part.trim().startsWith(`${OWNER_COOKIE}=`));
  if (isBeaconKind(kind) && !own && !isAutomated(request.headers.get('user-agent'))) {
    await recordListingEvent(params.slug ?? '', kind, request.headers.get('user-agent'));
  }
  return new Response(null, { status: 204 });
};
