import type { APIRoute } from 'astro';

import { listings } from '../../../lib/listings';

/**
 * PDF endpoint.
 *
 * The file is rendered by the worker's render_pdf job, which drives a real
 * browser against THIS page — one template, two formats, no second layout to
 * drift out of step (worker/src/handlers/pdf.ts). The result lands in the
 * public bucket and its URL is written to listings.media.pdfUrl.
 *
 * WHY THIS IS STILL A STUB, honestly: the site builds with `output: 'static'`,
 * so an endpoint's status and headers are discarded — only the body is written
 * to disk. A 302 here would produce an empty file, not a redirect. A stable
 * /a/SLUG/pdf link that always points at the newest render therefore needs
 * either on-demand rendering or a generated redirect map, and both belong with
 * the change that makes these pages read from Supabase instead of the fixtures
 * in lib/listings.ts.
 *
 * Until then the URL is media.pdfUrl itself. The listing page does not link to
 * it yet: putting a download control on the page is a design change to a
 * template held to a byte-identical CSS contract, and that is not a decision
 * to make in passing.
 */
export function getStaticPaths() {
  return listings.map((listing) => ({ params: { slug: listing.slug } }));
}

export const GET: APIRoute = ({ params }) => {
  const listing = listings.find((candidate) => candidate.slug === params.slug);
  const pdfUrl = listing?.media.pdfUrl;

  // Hebrew first, because this URL can be opened from a shared link by someone
  // who has never heard of a build pipeline.
  const body = pdfUrl
    ? `הקובץ זמין בכתובת:\n${pdfUrl}\n`
    : 'הקובץ עדיין בהכנה.\nThe PDF has not been rendered for this listing yet.\n';

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
