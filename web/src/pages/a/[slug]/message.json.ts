import type { APIRoute } from 'astro';

import { publishedListing } from '../../../lib/listing-from-row';
import { shareText } from '../../../lib/share-text';

/**
 * The message for the share sheet (lib/share-sheet.ts), as data: the same
 * text, link and preview the share kit shows, so the sheet on the editor and
 * on the dashboard sends what the kit sends.
 *
 * Public, like the page it describes: everything here is on the published
 * page already. Never cached — the agent may have changed the price a minute
 * ago, and the sheet opens right after publish and after edits.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, site, url }) => {
  const listing = params.slug ? await publishedListing(params.slug) : undefined;
  if (!listing) {
    return new Response('{}', {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(shareText(listing, site?.origin ?? url.origin)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
