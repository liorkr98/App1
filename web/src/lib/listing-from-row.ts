import { parseEnrichmentBlock } from '@/features/listings/enrichment-payload';
import { descriptionOrArea } from '@/features/listings/neighborhood-note';
import type { Listing } from '@/types/listing';

import { listingFromRow, LISTING_COLUMNS, selectListingColumns, type ListingRow } from './listing-row-map';
import { listingBySlug } from './listings';
import { supabaseConfigured, supabasePublic } from './supabase';

export { listingFromRow, LISTING_COLUMNS, type ListingRow };

/**
 * A published listing, by slug.
 *
 * Sold and archived listings 404. The public link is for a live ad. The one
 * exception is the listing page itself (`{ sold: true }`): a sold listing
 * the agent kept up as a record of the sale (0047). RLS decides which sold
 * rows can be read at all — before 0047 none, after it only sold_public —
 * so the page asks for both statuses and the database answers.
 *
 * Demo fixtures win so `/a/A7K2M` stays the visual contract even if someone
 * later inserts a real row with that slug — they cannot, the check is five
 * Crockford characters and the samples are the same alphabet, but the
 * fixtures are what CI builds against and must not start reading a database.
 */
export async function publishedListing(slug: string, options: { sold?: boolean } = {}): Promise<Listing | undefined> {
  const demo = listingBySlug(slug);
  if (demo) return demo;

  if (!supabaseConfigured) return undefined;

  try {
    const { data, error } = await selectListingColumns((columns) =>
      supabasePublic()
        .from('listings')
        .select(columns)
        .eq('slug', slug)
        .in('status', options.sold ? ['published', 'sold'] : ['published'])
        .maybeSingle(),
    );

    if (error || !data) return undefined;
    const listing = listingFromRow(data as unknown as ListingRow);
    if (!listing) return undefined;

    try {
      const { data: enrich, error: enrichError } = await supabasePublic()
        .from('listing_enrichment')
        .select('payload')
        .eq('listing_id', listing.id)
        .maybeSingle();
      if (enrichError || !enrich) return listing;
      const parsed = parseEnrichmentBlock((enrich as { payload: unknown }).payload);
      if (!parsed) return listing;
      return {
        ...listing,
        enrichment: parsed,
        description: descriptionOrArea(
          listing.description,
          parsed.category === 'property' ? parsed.neighborhoodNote : undefined,
        ),
      };
    } catch {
      return listing;
    }
  } catch {
    return undefined;
  }
}

/** Indexable published/sold listings, for the sitemap. Demos are never listed. */
export async function indexableListings(): Promise<{ slug: string; publishedAt?: string }[]> {
  if (!supabaseConfigured) return [];

  try {
    const { data, error } = await supabasePublic()
      .from('listings')
      .select('slug, published_at')
      .eq('indexable', true)
      .eq('status', 'published');

    if (error || !data) return [];
    return data.map((row) => ({
      slug: String((row as { slug: string }).slug),
      ...((row as { published_at?: string | null }).published_at
        ? { publishedAt: String((row as { published_at: string }).published_at) }
        : {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Whether a one-time page has run out (docs/PRICING.md §2: HTTP 410,
 * "המודעה הסתיימה", noindex). Only a page published on a purchase expires:
 * `expires_at` on any other row is the old, unenforced 12-month stamp.
 *
 * Read on its own, and false on any error, so listing pages keep rendering
 * if this deploys before migration 0040 adds `purchase_id`. Expiry is a
 * courtesy to the buyer; the gate that matters (publishing) is the trigger.
 */
export async function purchaseExpired(listingId: string, now: Date = new Date()): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { data, error } = await supabasePublic()
      .from('listings')
      .select('purchase_id, expires_at')
      .eq('id', listingId)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as { purchase_id: string | null; expires_at: string | null };
    if (!row.purchase_id || !row.expires_at) return false;
    const ends = Date.parse(row.expires_at);
    return Number.isFinite(ends) && ends <= now.getTime();
  } catch {
    return false;
  }
}
