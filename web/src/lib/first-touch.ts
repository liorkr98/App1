import { classifySource, type Source } from '@/features/billing/source';

const KEY = 'amudsell.first-touch';

/**
 * Remembers where this person first came from, on their first page view,
 * so a later billing event can say (PRICING §7). Kept in this browser only;
 * no network, and nothing here is personal. Deliberately free of the
 * Supabase client: it runs on every page.
 */
export function captureFirstTouch(): Source {
  try {
    const kept = window.localStorage.getItem(KEY) as Source | null;
    if (kept) return kept;
    const source = classifySource(window.location.href, document.referrer);
    window.localStorage.setItem(KEY, source);
    return source;
  } catch {
    return classifySource(window.location.href, document.referrer);
  }
}

/**
 * One site visit, sent once per page per tab (migration 0042, the owner's
 * data page). No cookie and nothing personal: this page's address and the
 * referring page go to /api/site-view, which decides whether it counts and
 * keeps only a count per day, path and source. Here, not in its own module,
 * because it runs on every page and the homepage is at its 900 KB budget:
 * a separate chunk costs more than the code.
 */
export function sendSiteView(): void {
  try {
    // ' /a/ /b/ ': the paths this tab has counted, space-separated.
    const path = ` ${location.pathname} `;
    const seen = sessionStorage.getItem('amud.seen') ?? ' ';
    if (seen.includes(path)) return;
    sessionStorage.setItem('amud.seen', seen + path.slice(1));
    navigator.sendBeacon('/api/site-view', `${location.href}\n${document.referrer}`);
  } catch {
    // A blocked sessionStorage or beacon costs one visit, never the page.
  }
}
