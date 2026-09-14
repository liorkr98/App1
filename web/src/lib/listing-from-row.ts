import {
  TEMPLATE_IDS,
  type Fact,
  type Listing,
  type ListingStatus,
  type Media,
  type Seller,
  type TemplateId,
} from '@/types/listing';
import type { ListingCategory } from '@/features/listings/schemas';

import { listingBySlug } from './listings';
import { supabaseConfigured, supabasePublic } from './supabase';

const LISTING_COLUMNS =
  'id, slug, category, title, description, price, currency, list_price, price_note, facts, media, disclosures, location, seller, template, accent, status, indexable, published_at, og_image_hash, audience';

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
  published_at: string | null;
  og_image_hash: string | null;
  audience: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  };
}

function asMedia(value: unknown): Media | undefined {
  if (!isRecord(value) || !isRecord(value.cover) || typeof value.cover.url !== 'string') {
    return undefined;
  }
  const cover = {
    id: String(value.cover.id ?? 'cover'),
    url: String(value.cover.url),
    alt: typeof value.cover.alt === 'string' ? value.cover.alt : '',
    width: Number(value.cover.width ?? 1),
    height: Number(value.cover.height ?? 1),
  };
  const gallery = Array.isArray(value.gallery)
    ? value.gallery.flatMap((item) => {
        if (!isRecord(item) || typeof item.url !== 'string') return [];
        return [
          {
            id: String(item.id ?? item.url),
            url: String(item.url),
            alt: typeof item.alt === 'string' ? item.alt : '',
            width: Number(item.width ?? 1),
            height: Number(item.height ?? 1),
            ...(typeof item.caption === 'string' ? { caption: item.caption } : {}),
          },
        ];
      })
    : [];
  return {
    cover,
    gallery,
    ...(typeof value.pdfUrl === 'string' ? { pdfUrl: value.pdfUrl } : {}),
  };
}

function asTemplate(value: string): TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value)
    ? (value as TemplateId)
    : 'editorial';
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

  const location = isRecord(row.location) && typeof row.location.city === 'string'
    ? {
        city: row.location.city,
        ...(typeof row.location.street === 'string' ? { street: row.location.street } : {}),
      }
    : undefined;

  return {
    id: row.id,
    slug: row.slug,
    category: row.category as ListingCategory,
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
    ...(row.og_image_hash ? { ogImageHash: row.og_image_hash } : {}),
    ...(row.audience === 'investor' || row.audience === 'resident'
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
