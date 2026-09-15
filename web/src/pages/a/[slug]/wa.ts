import type { APIRoute } from 'astro';

import { CATEGORY_PRESENTATION } from '../../../lib/category-presentation';
import { recordListingEvent } from '../../../lib/listing-events';
import { publishedListing } from '../../../lib/listing-from-row';

/**
 * WhatsApp hop.
 *
 * The listing page itself has no JavaScript, so a tap on the dock cannot
 * be counted there. This route records the event, then 302s to wa.me.
 * Demo fixtures (A7K2M / V3M9Q) still hop even when they are not a row.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug ?? '';
  const listing = slug ? await publishedListing(slug) : undefined;
  if (!listing || listing.status === 'sold') {
    return new Response('העמוד לא נמצא.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  await recordListingEvent(slug, 'wa', request.headers.get('user-agent'));

  const fallback = CATEGORY_PRESENTATION[listing.category].whatsappMessage;
  const text = url.searchParams.get('text') || fallback;
  const location = `https://wa.me/${listing.seller.phone}?text=${encodeURIComponent(text)}`;

  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
};
