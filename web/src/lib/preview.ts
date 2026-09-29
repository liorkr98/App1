import { allowedPreviewUrl } from '@/features/preview/preview-media';
import type { Listing } from '@/types/listing';

import { listingFromRow, type ListingRow } from './listing-from-row';
import { SUPABASE_URL } from './supabase';

/**
 * The editor's live preview, server side (pages/preview.astro).
 *
 * The editor posts the row a save WOULD write (lib/listing-row.ts builds it,
 * the same functions saveListing uses). This turns that into a Listing with
 * the same `listingFromRow` the published page uses, after taking out
 * anything a draft cannot carry:
 *   - the id, slug and status are ours, not the client's: 'draft', which
 *     also keeps the page's analytics beacon off (BaseListing)
 *   - coordinates are never accepted (the page only has what a save has)
 *   - every picture URL must pass allowedPreviewUrl, or it is dropped
 *   - indexable is always false
 *
 * Nothing here reads or writes the database. Nothing is stored.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown, max = 4000) => (typeof value === 'string' ? value.slice(0, max) : '');

function cleanImage(value: unknown, origin: string, storage: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const url = allowedPreviewUrl(value.url, origin, storage);
  if (!url) return undefined;
  return { ...value, url };
}

function cleanMedia(value: unknown, origin: string, storage: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const cover = cleanImage(value.cover, origin, storage);
  if (!cover) return undefined;
  const gallery = Array.isArray(value.gallery)
    ? value.gallery.slice(0, 40).flatMap((item) => {
        const image = cleanImage(item, origin, storage);
        return image ? [image] : [];
      })
    : [];
  const floorPlan = cleanImage(value.floorPlan, origin, storage);
  const spin = Array.isArray(value.spin)
    ? value.spin.slice(0, 40).flatMap((item) => {
        const image = cleanImage(item, origin, storage);
        return image ? [image] : [];
      })
    : [];
  return { cover, gallery, ...(floorPlan ? { floorPlan } : {}), ...(spin.length > 0 ? { spin } : {}) };
}

function cleanLocation(value: unknown): Record<string, string> | null {
  if (!isRecord(value) || typeof value.city !== 'string') return null;
  return {
    city: text(value.city, 120),
    ...(typeof value.street === 'string' ? { street: text(value.street, 160) } : {}),
  };
}

export function previewListing(input: unknown, origin: string): Listing | undefined {
  if (!isRecord(input)) return undefined;
  const storage = new URL(SUPABASE_URL).origin;
  const category = input.category === 'vehicle' ? 'vehicle' : input.category === 'property' ? 'property' : '';
  const media = cleanMedia(input.media, origin, storage);
  const row: ListingRow = {
    id: 'preview',
    slug: 'preview',
    category,
    title: text(input.title, 200),
    description: text(input.description, 6000),
    price: Number.isFinite(Number(input.price)) ? Number(input.price) : 0,
    currency: 'ILS',
    list_price: null,
    price_note: typeof input.price_note === 'string' ? text(input.price_note, 120) : null,
    facts: Array.isArray(input.facts) ? input.facts.slice(0, 80) : [],
    media: media ?? null,
    disclosures: Array.isArray(input.disclosures)
      ? input.disclosures.filter((item): item is string => typeof item === 'string').slice(0, 20).map((item) => text(item, 600))
      : null,
    location: cleanLocation(input.location),
    seller: isRecord(input.seller)
      ? {
          ...input.seller,
          agencyLogoUrl: allowedPreviewUrl(input.seller.agencyLogoUrl, origin, storage) ?? '',
        }
      : null,
    template: text(input.template, 40),
    accent: typeof input.accent === 'string' ? text(input.accent, 40) : null,
    status: 'draft',
    indexable: false,
    pre_portal: input.pre_portal === true,
    published_at: null,
    og_image_hash: null,
    audience: typeof input.audience === 'string' ? text(input.audience, 20) : null,
    hyad_mark: input.hyad_mark !== false,
  };
  return listingFromRow(row);
}
