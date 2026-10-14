import { OWNER_COOKIE, isAutomated } from './count-rules.js';

/**
 * Visits to the site's own pages: the homepage, pricing, the guides
 * (migration 0042, 13 Oct 2026, the owner's data page).
 *
 * Cookieless. The page sends one beacon per path per tab; the Worker drops
 * automation and the signed-in owner (the same rules as listing views,
 * count-rules.ts) and calls record_site_view, which stores a count per
 * Israel day, path and source. Nothing about the person is kept.
 *
 * These mirror site_view_path and site_view_source in 0042. The database is
 * the check that holds; these keep the request from being sent for nothing.
 */

/** Pages that are not site visits: listings, accounts, the editor, the API, fixtures. */
const NOT_COUNTED = /^\/(a|api|admin|me|mine|new|enter|up|lab|preview|template-check)\//;

/** The path as it is stored, or null when it is not one we count. */
export function siteViewPath(raw: string | null | undefined): string | null {
  let path = (raw ?? '').toLowerCase();
  if (!/^\/[a-z0-9/-]{0,80}$/.test(path) || path.includes('//')) return null;
  if (!path.endsWith('/')) path += '/';
  if (NOT_COUNTED.test(path)) return null;
  // A handle is often a person's name.
  if (/^\/agent\/./.test(path)) return '/agent/';
  if (path.split('/').filter(Boolean).length > 4) return null;
  return path;
}

const SOURCE = /^[a-z0-9.-]{1,40}$/;

/** A host-like word, lower case, or 'direct'. */
export function normaliseSource(raw: string | null | undefined): string {
  const source = (raw ?? '').trim().toLowerCase();
  return SOURCE.test(source) ? source : 'direct';
}

/**
 * Where a visit came from: utm_source when the link carried one, else the
 * referring site's host without "www.", else direct. A visit from another
 * page of ours is 'internal', so the homepage's own links are not a source.
 */
export function visitSource(input: { utm?: string | null; referrer?: string | null; ownHost: string }): string {
  if (input.utm) return normaliseSource(input.utm);
  if (!input.referrer) return 'direct';
  let host: string;
  try {
    host = new URL(input.referrer).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  const own = input.ownHost.toLowerCase().replace(/^www\./, '');
  host = host.replace(/^www\./, '');
  if (!host) return 'direct';
  if (host === own) return 'internal';
  return normaliseSource(host);
}

/** True when a beacon is a person who is not the signed-in owner. */
export function siteVisitCounts(input: { userAgent: string | null; cookie: string | null }): boolean {
  if (isAutomated(input.userAgent)) return false;
  const own = (input.cookie ?? '').split(';').some((part) => part.trim().split('=')[0] === OWNER_COOKIE);
  return !own;
}
