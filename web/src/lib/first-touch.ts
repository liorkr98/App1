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
