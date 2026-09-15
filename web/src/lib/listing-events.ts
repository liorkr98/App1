import { isPreviewScraper } from '@/features/analytics/scrapers';
import { isValidSlug } from '@/features/listings/slug';

import { supabaseConfigured, supabasePublic } from './supabase';

/**
 * Records a view or WhatsApp tap for a live listing.
 *
 * Fail closed and silent: a missing client, a scraper, an invalid slug, or
 * an RPC error must not delay or break the page the buyer came to read.
 * listing_events holds no UA and no IP (CLAUDE.md §9).
 */
export async function recordListingEvent(
  slug: string,
  kind: 'view' | 'wa',
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
