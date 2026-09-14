import type { APIRoute } from 'astro';

import { publishedListing } from '../../../lib/listing-from-row';

/**
 * PDF endpoint.
 *
 * The file is rendered by the worker's render_pdf job, which drives a real
 * browser against THIS page — one template, two formats, no second layout to
 * drift out of step (worker/src/handlers/pdf.ts). The result lands in the
 * public bucket and its URL is written to listings.media.pdfUrl.
 *
 * On-demand so the status and Location header survive. Under `output: static`
 * they were discarded and this route could only emit a text body.
 *
 * The listing page still does not link here: putting a download control on
 * the page is a design change to a template held to a byte-identical CSS
 * contract.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const listing = await publishedListing(params.slug ?? '');
  if (!listing) {
    return new Response('העמוד לא נמצא.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const pdfUrl = listing.media.pdfUrl;
  if (pdfUrl) {
    return new Response(null, {
      status: 302,
      headers: { Location: pdfUrl },
    });
  }

  return new Response('הקובץ עדיין בהכנה.\nThe PDF has not been rendered for this listing yet.\n', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
