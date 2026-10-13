import type { APIRoute } from 'astro';

import { CATEGORY_PRESENTATION } from '../../../lib/category-presentation';
import { countListingEvent } from '../../../lib/listing-events';
import { publishedListing } from '../../../lib/listing-from-row';
import { listingBySlug } from '../../../lib/listings';

/**
 * WhatsApp hop.
 *
 * The listing page itself has no JavaScript, so a tap on the dock cannot
 * be counted there. This route records the event, then 302s to wa.me.
 * Demo fixtures never hop: they go to the template gallery instead.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug ?? '';
  // A fixture's number is well-formed and may be a stranger's: an example
  // page never opens a chat (13 Oct 2026). Its buttons already point at the
  // demo note; this covers a link typed or shared by hand.
  if (listingBySlug(slug)) {
    return new Response(null, { status: 302, headers: { Location: '/templates/' } });
  }
  const listing = slug ? await publishedListing(slug) : undefined;
  if (!listing || listing.status === 'sold') {
    return new Response('העמוד לא נמצא.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Counted only when a person tapped (count-rules.ts); the hop happens either way.
  const counted = await countListingEvent(slug, 'wa', request);

  const fallback = CATEGORY_PRESENTATION[listing.category].whatsappMessage;
  const text = url.searchParams.get('text') || fallback;
  const location = `https://wa.me/${listing.seller.phone}?text=${encodeURIComponent(text)}`;

  const headers = new Headers({ Location: location });
  if (counted) headers.append('Set-Cookie', counted);
  return new Response(null, { status: 302, headers });
};
