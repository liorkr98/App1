import type { Listing } from '@/types/listing';

/**
 * Structured data for opted-in listing pages only.
 *
 * Do not emit this on a noindex page — a private address in Google's
 * structured-data report is worse than no markup. Callers must already have
 * checked `listing.indexable`.
 *
 * Not a valuation: price is an Offer the seller named, not an estimate.
 */
export function listingJsonLd(listing: Listing, canonical: string): Record<string, unknown> {
  const images = [
    listing.media.cover.url,
    ...listing.media.gallery.map((image) => image.url),
  ].filter(Boolean);

  const offer = {
    '@type': 'Offer',
    price: listing.price,
    priceCurrency: listing.currency || 'ILS',
    url: canonical,
    availability:
      listing.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
  };

  if (listing.category === 'property') {
    return {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: listing.title.replace(/\s*\n\s*/g, ' '),
      description: listing.description,
      url: canonical,
      image: images,
      offers: offer,
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Vehicle'],
    name: listing.title.replace(/\s*\n\s*/g, ' '),
    description: listing.description,
    url: canonical,
    image: images,
    offers: offer,
  };
}
