import { shouldCount, type CountedKind } from '@/features/analytics/count-rules';
import type { EventKind } from '@/features/analytics/events';
import { isPreviewScraper } from '@/features/analytics/scrapers';
import { isValidSlug } from '@/features/listings/slug';

import { supabaseConfigured, supabasePublic } from './supabase';

/**
 * Records a listing event (view, WhatsApp tap, share, read-to-agent).
 *
 * Fail closed and silent: a missing client, a scraper, an invalid slug, or
 * an RPC error must not delay or break the page the buyer came to read.
 * listing_events holds no UA and no IP (CLAUDE.md §9).
 */
export async function recordListingEvent(
  slug: string,
  kind: EventKind,
  userAgent: string | null | undefined,
): Promise<void> {
  if (!supabaseConfigured) return;
  if (!isValidSlug(slug)) return;
  if (kind === 'view' && isPreviewScraper(userAgent)) return;

  try {
    await supabasePublic().rpc('record_listing_event', { p_slug: slug, p_kind: kind });
  } catch {
    // The page still has to render. Analytics is not the product.
  }
}

/**
 * Records a view or a WhatsApp tap when the request is a person
 * (count-rules.ts), and returns the cookie that keeps that person to one
 * count per listing per 30 minutes. The caller sets it on its response.
 */
export async function countListingEvent(
  slug: string,
  kind: CountedKind,
  request: Request,
): Promise<string | undefined> {
  const headers = request.headers;
  const decision = shouldCount({
    method: request.method,
    userAgent: headers.get('user-agent'),
    secPurpose: headers.get('sec-purpose'),
    purpose: headers.get('purpose') ?? headers.get('x-purpose') ?? headers.get('x-moz'),
    cookie: headers.get('cookie'),
    slug,
    kind,
  });
  if (!decision.count) return undefined;
  await recordListingEvent(slug, kind, headers.get('user-agent'));
  return decision.setCookie;
}
