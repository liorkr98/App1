import type { APIRoute } from 'astro';

import { robotsTxt } from '../lib/seo';

/**
 * Built from the host that was asked, so the Sitemap line names the host
 * that answers (it pointed at a domain with no DNS until 12 Oct 2026, and at
 * the build's SITE_URL until 14 Oct, which Search Console refused). The rules are in
 * lib/seo.ts: private paths for everyone, and no listing pages for the
 * crawlers that gather model-training text.
 */
// On request, not built: a built file would carry the build's host again.
export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  new Response(robotsTxt(new URL(url.origin)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
