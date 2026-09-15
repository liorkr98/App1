import {
  TEMPLATE_IDS,
  type Fact,
  type Listing,
  type ListingStatus,
  type Media,
  type Seller,
  type TemplateId,
} from '@/types/listing';
import { isPhotoRoom } from '@/features/listings/photo-rooms';

import { listingBySlug } from './listings';
import { supabaseConfigured, supabasePublic } from './supabase';

const LISTING_COLUMNS =
  'id, slug, category, title, description, price, currency, list_price, price_note, facts, media, disclosures, location, seller, template, accent, status, indexable, pre_portal, published_at, og_image_hash, audience';

interface ListingRow {
  id: string;
  slug: string;
  category: string;
  title: string;
  description: string;
  price: number | string;
  currency: string | null;
  list_price: number | string | null;
  price_note: string | null;
  facts: unknown;
  media: unknown;
  disclosures: string[] | null;
  location: unknown;
  seller: unknown;
  template: string;
  accent: string | null;
  status: string;
  indexable: boolean;
  pre_portal?: boolean | null;
  published_at: string | null;
  og_image_hash: string | null;
  audience: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asSeller(value: unknown): Seller | undefined {
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === 'string' ? value.name : '';
  const phone = typeof value.phone === 'string' ? value.phone : '';
  if (!name || !phone) return undefined;
  return {
    name,
    phone,
    ...(typeof value.role === 'string' ? { role: value.role } : {}),
    ...(typeof value.agencyName === 'string' ? { agencyName: value.agencyName } : {}),
    ...(typeof value.licenceNumber === 'string' ? { licenceNumber: value.licenceNumber } : {}),
    ...(typeof value.agencyLogoUrl === 'string' && value.agencyLogoUrl.trim() !== ''
      ? { agencyLogoUrl: value.agencyLogoUrl }
      : {}),
    ...(value.logoPlacement === 'bar' ||
    value.logoPlacement === 'barWide' ||
    value.logoPlacement === 'footerOnly' ||
    value.logoPlacement === 'watermark'
      ? { logoPlacement: value.logoPlacement }
      : {}),
  };
}

function asImage(value: Record<string, unknown>, fallbackId: string) {
  return {
    id: String(value.id ?? fallbackId),
    url: String(value.url),
    alt: typeof value.alt === 'string' ? value.alt : '',
    width: Number(value.width ?? 1),
    height: Number(value.height ?? 1),
    ...(typeof value.caption === 'string' ? { caption: value.caption } : {}),
    ...(isPhotoRoom(value.room) ? { room: value.room } : {}),
  };
}

function asMedia(value: unknown): Media | undefined {
  if (!isRecord(value) || !isRecord(value.cover) || typeof value.cover.url !== 'string') {
    return undefined;
  }
  const cover = asImage(value.cover, 'cover');
  const gallery = Array.isArray(value.gallery)
    ? value.gallery.flatMap((item) => {
        if (!isRecord(item) || typeof item.url !== 'string') return [];
        return [asImage(item, String(item.id ?? item.url))];
      })
    : [];
  return {
    cover,
    gallery,
    ...(typeof value.pdfUrl === 'string' ? { pdfUrl: value.pdfUrl } : {}),
    ...(typeof value.tourUrl === 'string' && value.tourUrl.startsWith('https://')
      ? { tourUrl: value.tourUrl }
      : {}),
  };
}

function asTemplate(value: string): TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value)
    ? (value as TemplateId)
    : 'agency';
}

/**
 * Maps a listings row onto the domain type the page already renders.
 *
 * Pure, so a bad row becomes `undefined` rather than a half-built page.
 */
export function listingFromRow(row: ListingRow): Listing | undefined {
  if (row.category !== 'property' && row.category !== 'vehicle') return undefined;
  if (row.status !== 'draft' && row.status !== 'published' && row.status !== 'sold' && row.status !== 'archived') {
    return undefined;
  }

  const seller = asSeller(row.seller);
  const media = asMedia(row.media);
  if (!seller || !media) return undefined;

  const lat = isRecord(row.location) ? asCoord(row.location.lat) : undefined;
  const lng = isRecord(row.location) ? asCoord(row.location.lng) : undefined;
  const location = isRecord(row.location) && typeof row.location.city === 'string'
    ? {
        city: row.location.city,
        ...(typeof row.location.street === 'string' ? { street: row.location.street } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
      }
    : undefined;

  return {
    id: row.id,
    slug: row.slug,
    category: row.category as Listing['category'],
    title: row.title,
    description: row.description ?? '',
    price: Number(row.price),
    currency: row.currency ?? 'ILS',
    ...(row.list_price != null ? { listPrice: Number(row.list_price) } : {}),
    ...(row.price_note ? { priceNote: row.price_note } : {}),
    facts: Array.isArray(row.facts) ? (row.facts as Fact[]) : [],
    media,
    ...(row.disclosures && row.disclosures.length > 0 ? { disclosures: row.disclosures } : {}),
    ...(location ? { location } : {}),
    seller,
    template: asTemplate(row.template),
    ...(row.accent ? { accent: row.accent } : {}),
    status: row.status as ListingStatus,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    indexable: row.indexable === true,
    ...(row.pre_portal === true ? { prePortal: true } : {}),
    ...(row.og_image_hash ? { ogImageHash: row.og_image_hash } : {}),
    ...(row.audience === 'investor' || row.audience === 'resident' || row.audience === 'both'
      ? { audience: row.audience }
      : {}),
  };
}

/**
 * A published or sold listing, by slug.
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
      .in('status', ['published', 'sold'])
      .maybeSingle();

    if (error || !data) return undefined;
    return listingFromRow(data as ListingRow);
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
      .in('status', ['published', 'sold']);

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
