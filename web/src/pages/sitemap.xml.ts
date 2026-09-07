import type { APIRoute } from 'astro';

import { listings } from '../lib/listings';

/**
 * Sitemap — indexable listings only.
 *
 * Written by hand rather than with @astrojs/sitemap because the filter is the
 * entire point: a sitemap that lists every page would hand Google the pages
 * a private seller explicitly chose to keep out of search, and their home
 * address with them.
 *
 * The RTL fixture is not a listing and therefore cannot appear here.
 */
export const GET: APIRoute = ({ site }) => {
  const indexable = listings.filter((listing) => listing.indexable);

  const urls = indexable
    .map((listing) => {
      const location = new URL(`/a/${listing.slug}/`, site).href;
      const lastmod = listing.publishedAt ? `\n    <lastmod>${listing.publishedAt}</lastmod>` : '';
      return `  <url>\n    <loc>${location}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
