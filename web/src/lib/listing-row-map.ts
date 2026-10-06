/**
 * A listings row, mapped onto the domain type the page renders.
 *
 * Split from listing-from-row.ts (6 Oct 2026) so the browser can use it —
 * the share images are drawn from the row in the agent's browser — without
 * pulling in the demo listings and their sample photographs, which the
 * server-side lookup there needs and a phone does not.
 */
import {
  type Fact,
  type Listing,
  type ListingStatus,
  type Media,
  type Seller,
  type TemplateId,
} from '@/types/listing';
import { canonicalSellerRole } from '@/features/agents/profile';
import { parseEnrichmentBlock } from '@/features/listings/enrichment-payload';
import { descriptionOrArea } from '@/features/listings/neighborhood-note';
import { OSM_ATTRIBUTION, type AreaPlace, type AreaPlaces } from '@/features/listings/area-note';
import { applyPicks, rankEveryday } from '@/features/listings/place-rank';
import { isPhotoRoom } from '@/features/listings/photo-rooms';
import { cleanPlanRooms, depthFor, spinFrames } from '@/features/listings/rich-media';
import { cardFor } from '@/features/listings/share-card';
import { resolveTemplateId } from '@/features/templates/manifest';


export const LISTING_COLUMNS =
  'id, slug, category, title, description, price, currency, list_price, price_note, facts, media, disclosures, location, seller, template, accent, status, indexable, pre_portal, published_at, og_image_hash, audience, hyad_mark, area_places';

export interface ListingRow {
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
  hyad_mark?: boolean | null;
  area_places?: unknown;
  listing_enrichment?: { payload: unknown } | { payload: unknown }[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AREA_GROUPS = [
  'neighbourhoods',
  'schools',
  'transit',
  'parks',
  'community',
  'shops',
] as const;

/**
 * The OpenStreetMap names around this address, validated.
 *
 * `{}` is the column default and means no lookup was ever made, so the page
 * draws no map and owes no credit. Anything that survives this is a list of
 * named points, each with a position, and — only when a pedestrian router
 * answered — routed walking minutes.
 *
 * A place with no coordinate is DROPPED rather than defaulted: it has nowhere
 * to go on the map. `walkMinutes` is kept only when it is a real number, so a
 * `null` left by a router that could not reach somewhere renders as no time at
 * all rather than as zero (CLAUDE.md §7 — absent is not the same as none).
 */
function asAreaPlaces(value: unknown): AreaPlaces | undefined {
  if (!isRecord(value) || typeof value.city !== 'string') return undefined;

  const group = (key: string): AreaPlace[] => {
    const raw = value[key];
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((item) => {
      if (!isRecord(item) || typeof item.name !== 'string') return [];
      const lat = asCoord(item.lat);
      const lon = asCoord(item.lon);
      if (lat === undefined || lon === undefined) return [];

      const walkMinutes = typeof item.walkMinutes === 'number' ? item.walkMinutes : undefined;
      return [
        {
          name: item.name,
          lat,
          lon,
          ...(walkMinutes !== undefined && Number.isFinite(walkMinutes) && walkMinutes > 0
            ? { walkMinutes: Math.round(walkMinutes) }
            : {}),
          ...(item.mode === 'bus' || item.mode === 'rail' ? { mode: item.mode } : {}),
        },
      ];
    });
  };

  const origin = isRecord(value.origin)
    ? { lat: asCoord(value.origin.lat), lon: asCoord(value.origin.lon) }
    : undefined;

  const picked = Array.isArray(value.picked)
    ? value.picked.filter((name): name is string => typeof name === 'string').slice(0, 8)
    : [];
  const shops = group('shops');
  const places: AreaPlaces = {
    city: value.city,
    ...(typeof value.street === 'string' ? { street: value.street } : {}),
    ...(origin?.lat !== undefined && origin.lon !== undefined
      ? { origin: { lat: origin.lat, lon: origin.lon } }
      : {}),
    neighbourhoods: group('neighbourhoods'),
    schools: picked.length > 0 ? applyPicks(group('schools'), picked) : group('schools'),
    transit: picked.length > 0 ? applyPicks(group('transit'), picked) : group('transit'),
    parks: picked.length > 0 ? applyPicks(group('parks'), picked) : group('parks'),
    community: picked.length > 0 ? applyPicks(group('community'), picked) : group('community'),
    shops: picked.length > 0 ? applyPicks(shops, picked) : rankEveryday(shops),
  };

  return AREA_GROUPS.some((key) => places[key].length > 0) ? places : undefined;
}

function asCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function enrichmentFromRow(row: ListingRow) {
  const nested = row.listing_enrichment;
  const payload = Array.isArray(nested) ? nested[0]?.payload : nested?.payload;
  return parseEnrichmentBlock(payload);
}

function asSeller(value: unknown): Seller | undefined {
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === 'string' ? value.name : '';
  const phone = typeof value.phone === 'string' ? value.phone : '';
  if (!name || !phone) return undefined;
  return {
    name,
    phone,
    role: canonicalSellerRole(typeof value.role === 'string' ? value.role : undefined),
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
  // P7 media (rich-media.ts validates each; anything off is simply absent).
  const floorPlan =
    isRecord(value.floorPlan) && typeof value.floorPlan.url === 'string'
      ? (() => {
          const rooms = cleanPlanRooms(value.floorPlan.rooms);
          return { ...asImage(value.floorPlan, 'plan'), ...(rooms.length > 0 ? { rooms } : {}) };
        })()
      : undefined;
  const spin = spinFrames(
    Array.isArray(value.spin)
      ? value.spin.flatMap((item, index) =>
          isRecord(item) && typeof item.url === 'string' ? [asImage(item, `spin-${index}`)] : [],
        )
      : [],
  );
  const depthUrl = depthFor(value.depth, cover.url);
  const https = (url: unknown) => (typeof url === 'string' && url.startsWith('https://') ? url : undefined);
  const storyUrl = https(value.storyUrl);
  const flyerUrl = https(value.flyerUrl);
  const card = cardFor(value.card);

  return {
    cover,
    gallery,
    ...(typeof value.pdfUrl === 'string' ? { pdfUrl: value.pdfUrl } : {}),
    ...(typeof value.tourUrl === 'string' && value.tourUrl.startsWith('https://')
      ? { tourUrl: value.tourUrl }
      : {}),
    ...(floorPlan ? { floorPlan } : {}),
    ...(spin.length > 0 ? { spin } : {}),
    ...(depthUrl ? { depthUrl } : {}),
    ...(storyUrl ? { storyUrl } : {}),
    ...(flyerUrl ? { flyerUrl } : {}),
    ...(card ? { card } : {}),
  };
}

/** Retired ids render as their successor (cinema → aurora), never as the default. */
function asTemplate(value: string): TemplateId {
  return resolveTemplateId(value);
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

  const enrichment = enrichmentFromRow(row);
  const areaPlaces = asAreaPlaces(row.area_places);

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
    description: descriptionOrArea(
      row.description ?? '',
      enrichment && enrichment.category === 'property' ? enrichment.neighborhoodNote : undefined,
    ),
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
    hyadMark: row.hyad_mark !== false,
    /*
     * The neighbourhood, and the ODbL credit it comes with (CLAUDE.md §10).
     * The page draws its map from these names and may have been written from
     * them, so the credit appears exactly on the pages that used the source
     * and on no others.
     */
    ...(areaPlaces
      ? { areaPlaces, textAttributions: [OSM_ATTRIBUTION] }
      : {}),
    ...(row.pre_portal === true ? { prePortal: true } : {}),
    ...(row.og_image_hash ? { ogImageHash: row.og_image_hash } : {}),
    ...(row.audience === 'investor' || row.audience === 'resident' || row.audience === 'both'
      ? { audience: row.audience }
      : {}),
    ...(enrichment ? { enrichment } : {}),
  };
}
