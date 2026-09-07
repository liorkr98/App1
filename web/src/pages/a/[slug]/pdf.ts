import type { APIRoute } from 'astro';

import { listings } from '../../../lib/listings';

/**
 * PDF endpoint — STUB.
 *
 * Stage D renders this with Puppeteer against the same Astro template the web
 * page uses, so there is one source and two formats. It is stubbed rather
 * than omitted so the route exists and anything linking to it fails loudly
 * with a message instead of a 404 that reads like a broken deploy.
 *
 * When Stage D lands, the Hebrew fonts must be EMBEDDED in the PDF. Without
 * embedding, Hebrew renders as empty boxes and nobody notices until a user
 * complains — which is why Stage D also asks for an automated check that
 * extracts text from the output and asserts a known Hebrew string is present.
 */
export function getStaticPaths() {
  return listings.map((listing) => ({ params: { slug: listing.slug } }));
}

export const GET: APIRoute = () =>
  new Response('PDF rendering arrives in Stage D.\nייצוא PDF יתווסף בשלב D.\n', {
    status: 501,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
