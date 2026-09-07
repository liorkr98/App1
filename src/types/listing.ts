import type { ListingCategory } from '@/features/listings/schemas';

/**
 * The listing domain (RESEARCH.md §6, PRD.md §2).
 *
 * Category-generic by construction: nothing here names 'property' or
 * 'vehicle'. What differs between categories is the fact schema, and that
 * lives in src/features/listings/schemas/.
 */

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export type FactValue = string | number | boolean | null;

export type FactType = 'text' | 'number' | 'boolean' | 'enum' | 'date';

/**
 * One answered — or deliberately unanswered — fact on a listing.
 *
 * `present` and `value` carry DIFFERENT information and must not be collapsed
 * (PRD.md §2):
 *
 *   present: false  the seller confirmed the feature is ABSENT.
 *                   The page renders it greyed, showing אין.
 *   value: null     the question was NOT ANSWERED.
 *                   The page omits it entirely and the grid reflows.
 *
 * So a fresh fact is `{ value: null, present: true }` — nothing said either
 * way. Marking absent sets `present: false`. Answering sets `value`.
 *
 * Render order matters: check `present` first, then `value`. A fact that is
 * absent has no value to show, but it is still worth showing.
 *
 * This distinction is the reason the page reads as honest rather than as an
 * ad. "No storage" is information.
 */
export interface Fact {
  key: string;
  /** Display string, in Hebrew. Authoritative — not a translation key. */
  label: string;
  value: FactValue;
  /** Display unit, e.g. מ״ר, ק״מ, סמ״ק. */
  unit?: string;
  type: FactType;
  present: boolean;
  required: boolean;
}

/**
 * The schema-side definition a Fact is built from. Lives in a category schema
 * file; `options` applies to `enum`, and to `date` fields that also accept a
 * fixed choice (תאריך כניסה accepts a date or מיידי / גמיש).
 */
export interface FactDefinition {
  key: string;
  label: string;
  type: FactType;
  unit?: string;
  /** Defaults to false. Only three fields per category are required. */
  required?: boolean;
  options?: readonly string[];

  /**
   * Shorter label for the three-column facts grid, where the full label does
   * not fit. The reference vehicle page labels the mileage cell ק״מ rather
   * than קילומטראז׳ for exactly this reason.
   *
   * Lives in the schema, not the grid component, so the grid stays free of
   * hardcoded field names.
   */
  gridLabel?: string;

  /**
   * Renders this fact and another as a single cell, `a / b`, under this
   * fact's label — the reference property page shows floor as 3 / 5 under
   * קומה, not as two separate cells.
   *
   * The paired fact is not rendered on its own. Also schema-side for the same
   * reason as gridLabel.
   */
  pairWith?: string;

  /**
   * Defaults to true. Set false for facts that already appear in the page
   * title and would be redundant in the grid — the reference vehicle page
   * carries make and model in the hero and not as cells.
   */
  showInGrid?: boolean;
}

/** A category's ordered fact definitions. Order is display order. */
export interface CategorySchema {
  category: string;
  facts: readonly FactDefinition[];
}

/** Builds the unanswered starting state for a category. */
export function factsFromSchema(schema: CategorySchema): Fact[] {
  return schema.facts.map((definition) => ({
    key: definition.key,
    label: definition.label,
    value: null,
    ...(definition.unit === undefined ? {} : { unit: definition.unit }),
    type: definition.type,
    present: true,
    required: definition.required ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export interface Image {
  id: string;
  url: string;
  width: number;
  height: number;
  /** Hebrew alt text. Empty string is valid for decorative images. */
  alt?: string;
  /** Placeholder shown while the image loads, to avoid layout shift. */
  blurhash?: string;
  /** Hebrew figcaption. Distinct from alt: alt describes, caption names. */
  caption?: string;
}

/** One captured room, rendered as a panorama scene in the tour. */
export interface PanoScene {
  id: string;
  /** Schema key of the room type, e.g. 'living_room'. */
  roomKey: string;
  /** Hebrew display label, e.g. סלון. */
  label: string;
  panoUrl: string;
  thumbUrl: string;
  /** Initial camera yaw in degrees. Defaults to 0 when absent. */
  yaw?: number;
  /** Initial camera pitch in degrees. Defaults to 0 when absent. */
  pitch?: number;
}

/** A doorway hotspot linking one scene to another. */
export interface SceneLink {
  fromSceneId: string;
  toSceneId: string;
  /** Hotspot position within the source panorama, in degrees. */
  yaw: number;
  pitch: number;
  /** Hebrew label shown on the hotspot, e.g. למטבח. */
  label: string;
}

export interface TourImmersive {
  type: 'tour';
  scenes: PanoScene[];
  /** May be empty. An unlinked tour still works as a room selector. */
  links: SceneLink[];
  /** Download size, shown before the user opts in on cellular. */
  payloadMb?: number;
}

export interface SpinImmersive {
  type: 'spin';
  frames: string[];
  /** Preferred over individual frames — 36 requests on cellular is slow. */
  spriteUrl?: string;
  /** Read from here, never hardcoded. 36 is the v1 default. */
  frameCount: number;
  /** Download size, shown before the user opts in on cellular. */
  payloadMb?: number;
}

export type Immersive = TourImmersive | SpinImmersive;

export interface Media {
  cover: Image;
  gallery: Image[];
  /** Absent until capture has been processed. The page works without it. */
  immersive?: Immersive;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface ListingLocation {
  /** Hebrew city name, e.g. חולון. */
  city: string;
  /** Hebrew street name. Omitted from the page when the seller opts out. */
  street?: string;
  /** Never rendered on the page. Used only to render the static map. */
  lat?: number;
  lng?: number;
}

export interface Seller {
  name: string;
  /** E.164 or local Israeli format. Rendered through the bidi helpers. */
  phone: string;
  avatarUrl?: string;
  /** Hebrew role line, e.g. בעל הדירה. */
  role?: string;
  /** Set for agents; absent for private sellers. */
  agencyName?: string;
  agencyLogoUrl?: string;
}

export type ListingStatus = 'draft' | 'published' | 'sold' | 'archived';

export type TemplateId = 'clean' | 'gallery' | 'luxury';

export interface Listing {
  id: string;
  /** 5 characters, base32 Crockford, generated server-side. */
  slug: string;
  category: ListingCategory;

  title: string;
  description: string;
  price: number;
  /** ISO 4217. ILS for the launch market. */
  currency: string;

  /**
   * Manufacturer or book price, shown beside the asking price. Its presence
   * is what selects the comparison form of the price note, so the component
   * branches on data rather than on category.
   */
  listPrice?: number;
  /** Free text beside the price when there is no listPrice, e.g. פינוי גמיש. */
  priceNote?: string;

  facts: Fact[];
  media: Media;

  /**
   * Things the seller volunteers that count against them — defects, wear,
   * work still needed.
   *
   * Rendered in its own framed block, never folded into the description,
   * because the point is that a buyer can find it without reading prose.
   * Disclosing raises trust and cuts wasted viewings.
   */
  disclosures?: string[];
  location?: ListingLocation;
  seller: Seller;
  template: TemplateId;

  status: ListingStatus;
  /** Absent while status is 'draft'. */
  publishedAt?: string;
  /** 12 months after publishing (PRD.md §5). */
  expiresAt?: string;

  /**
   * Whether search engines may index the page. Defaults to FALSE.
   *
   * A private seller generally does not want their home address permanently
   * searchable; an agent wants the organic traffic. That is the seller's call
   * to make, not ours, so the page ships noindex until they say otherwise.
   */
  indexable: boolean;
}
