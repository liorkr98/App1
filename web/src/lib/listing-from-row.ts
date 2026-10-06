import { parseEnrichmentBlock } from '@/features/listings/enrichment-payload';
import { descriptionOrArea } from '@/features/listings/neighborhood-note';
import type { Listing } from '@/types/listing';

import { listingFromRow, LISTING_COLUMNS, type ListingRow } from './listing-row-map';
import { listingBySlug } from './listings';
import { supabaseConfigured, supabasePublic } from './supabase';

export { listingFromRow, LISTING_COLUMNS, type ListingRow };

/**
 * A published listing, by slug.
 *
 * Sold and archived listings 404. The public link is for a live ad.
 *
 * Demo fixtures win so `/a/A7K2M` stays the visual contract even if someone
 * later inserts a real row with that slug — they cannot, the check is five
 * Crockford characters and the samples are the same alphabet, but the
 * fixtures are what CI builds against and must not start reading a database.
 */
export async function publishedListing(slug: string): Promise<Listing | undefined> {
  const demo = listingBySlug(slug);
  if (demo) return demo;

  if (!supabaseConfigured) return undefined;

  try {
    const { data, error } = await supabasePublic()
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error || !data) return undefined;
    const listing = listingFromRow(data as ListingRow);
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
