import type { APIRoute } from 'astro';

import { robotsTxt } from '../lib/seo';

/**
 * Built from the site URL, so the Sitemap line names the host that answers
 * (it pointed at a domain with no DNS until 12 Oct 2026). The rules are in
 * lib/seo.ts: private paths for everyone, and no listing pages for the
 * crawlers that gather model-training text.
 */
export const GET: APIRoute = ({ site, url }) =>
  new Response(robotsTxt(site ?? new URL(url.origin)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
