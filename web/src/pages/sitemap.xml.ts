import type { APIRoute } from 'astro';

import { indexableListings } from '../lib/listing-from-row';

/**
 * Sitemap — indexable listings only, plus the homepage.
 *
 * Written by hand rather than with @astrojs/sitemap because the filter is the
 * entire point: a sitemap that lists every page would hand Google the pages
 * a private seller explicitly chose to keep out of search, and their home
 * address with them.
 *
 * On-demand so a newly opted-in listing appears without a rebuild. Demo
 * fixtures are never listed — they are the visual contract, not inventory.
 */
export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('https://hasivuv.com');
  const listed = await indexableListings();

  const urls = [
    `  <url>\n    <loc>${new URL('/', origin).href}</loc>\n  </url>`,
    ...listed.map((listing) => {
      const location = new URL(`/a/${listing.slug}/`, origin).href;
      const lastmod = listing.publishedAt
        ? `\n    <lastmod>${listing.publishedAt}</lastmod>`
        : '';
      return `  <url>\n    <loc>${location}</loc>${lastmod}\n  </url>`;
    }),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
