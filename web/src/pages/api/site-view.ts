import type { APIRoute } from 'astro';

import { siteViewPath, siteVisitCounts, visitSource } from '@/features/analytics/site-visits';

import { supabaseConfigured, supabasePublic } from '../../lib/supabase';

/**
 * POST /api/site-view — one visit to a site page (migration 0042).
 *
 * The body is what lib/first-touch.ts sendSiteView sends: this page's
 * address, a newline, the referring page. The path and utm_source come from the
 * first, the source's host from the second. Automation and the signed-in owner do not count (the same
 * rules as listing views, count-rules.ts). Only a count per Israel day, path
 * and source is kept; the referrer is reduced to its host and never stored
 * whole. Always 204: the page never waits on this.
 */
export const prerender = false;

const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, url }) => {
  if (!supabaseConfigured) return done();
  if (!siteVisitCounts({ userAgent: request.headers.get('user-agent'), cookie: request.headers.get('cookie') })) return done();

  let page: URL;
  let referrer: string | null;
  try {
    const [address = '', from = ''] = (await request.text()).slice(0, 4000).split('\n');
    page = new URL(address);
    referrer = from || null;
  } catch {
    return done();
  }
  // Only our own pages: a beacon naming another site's address is not a visit.
  if (page.hostname !== url.hostname) return done();
  const path = siteViewPath(page.pathname);
  if (!path) return done();
  const source = visitSource({ utm: page.searchParams.get('utm_source'), referrer, ownHost: url.hostname });

  try {
    await supabasePublic().rpc('record_site_view', { p_path: path, p_source: source });
  } catch {
    // A lost count, never an error page.
  }
  return done();
};
