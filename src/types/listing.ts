import type { ListingCategory } from '@/features/listings/schemas/index.js';

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
 * Provenance of a fact's value.
 *
 * 'verified'  came from a public register and is displayed as מאומת with the
 *             source body and the date it was current.
 * 'seller'    the seller said so, and is displayed as לפי המוכר.
 *
 * There is no third class and there is no mixing. See RESEARCH.md §4.7 —
 * those rules are legal, not stylistic.
 */
export type FactSource = 'seller' | 'verified';

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

  /**
   * Where this number came from. NOT optional metadata — this is the trust
   * proposition (RESEARCH.md §4.7).
   *
   * An Israeli used-car buyer distrusts every figure in a listing. A page
   * that can say "the hand and the prior ownership are what the Ministry of
   * Transport holds, and here is the date" is offering something a classified
   * ad cannot. Collapse this into one visual class and the product is a
   * prettier Yad2.
   */
  source: FactSource;

  /**
   * Which body stands behind a verified fact, by name — משרד התחבורה,
   * רשות המסים. Cited, never paraphrased as "official data".
   */
  sourceName?: string;

  /**
   * When that record was current, rendered after נכון ל־. Public registers
   * lag by months, and a date the reader can judge for themselves is the
   * difference between a citation and a claim.
   */
  sourceDate?: string;
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
   * Whether digits are grouped: 1600 -> "1,600". Defaults to true.
   *
   * Set false for a number that is an IDENTIFIER rather than a quantity. A
   * year is the case that matters: 2021 grouped reads "2,021", which is
   * visibly wrong to anyone who owns a car, and it was doing exactly that on
   * the listing page AND on the WhatsApp card.
   *
   * On the schema rather than in the formatter, because whether a field is a
   * quantity is a property of the field. A formatter that checked for the key
   * 'year' would be a hardcoded field name in the layer that is specifically
   * kept free of them.
   */
  grouped?: boolean;

  /**
   * Defaults to 'seller'. Set 'verified' for fields a public register can
   * fill — the vehicle schema marks eight of its twelve that way.
   *
   * Schema-side rather than per-listing because whether a field CAN be
   * verified is a property of the field. Whether it WAS is a property of the
   * listing, and lives on the Fact.
   */
  source?: FactSource;

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
   * Marks the fact the price is divided by for the per-unit figure in the
   * price bar — ₪19,474 למ״ר under a property's asking price.
   *
   * On the schema for the same reason gridLabel and pairWith are: a formatter
   * that looked for the key 'area_sqm' would hardcode a field name in the
   * layer that is deliberately kept free of them, and a third category with a
   * different denominator would need the formatter edited rather than a
   * schema line added.
   *
   * At most one per category. The unit comes from the same definition.
   */
  priceDenominator?: boolean;

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

  /**
   * What the seller is selling, in Hebrew, for the category picker.
   *
   * Lives on the schema rather than in locales/ for the same reason the fact
   * labels do (CLAUDE.md §12): a category IS its schema, and the registry
   * promises that adding one means writing a schema file and adding a line.
   * A label in a second file would quietly break that promise — the category
   * would exist and have no name.
   */
  label: string;

  /**
   * The default role line under a seller's name — בעל הדירה, בעל הרכב.
   *
   * Here for the same reason `label` is: a category IS its schema, and the
   * fallback wording for its owner is a property of the category rather than
   * a translation. An agent who sets their own role (מתווך מורשה) overrides
   * it; a private seller who never opens the profile page still gets a line
   * that reads like a person instead of a blank.
   */
  ownerRole: string;

  facts: readonly FactDefinition[];

  /**
   * Fact keys to promote, in order, when the listing targets an investor.
   *
   * On the schema for the same reason gridLabel, pairWith and priceDenominator
   * are: which fields matter to which buyer is a property of the category, and
   * a third category would otherwise need the ordering code edited rather than
   * a line added here.
   *
   * Anything not listed keeps its schema order behind these.
   */
  investorLead?: readonly string[];
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
    // A fresh fact is always seller-sourced: nothing has been looked up yet.
    // A plate lookup promotes the fields it fills, and only those.
    source: 'seller',
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

  /**
   * Whether `{base}-{width}.webp` files exist alongside this URL.
   *
   * DEFAULTS TO FALSE, and the direction of that default is the point. No URL
   * can be inspected to find out — an extension says what a file IS, never
   * what was generated beside it. When the code guessed from the extension it
   * composed variants that had never been written, and every image on both
   * sample pages was a dead link while the build stayed green.
   *
   * So the producer declares it. The Stage D pipeline sets it true when it
   * has actually emitted the variants; anything else omits it and gets the
   * original URL with no srcset, which is correct and merely unoptimised.
   * The failure mode of forgetting is a larger download, not a broken image.
   */
  variants?: boolean;
}

export interface Media {
  cover: Image;
  gallery: Image[];
  /**
   * The rendered PDF, once the render_pdf job has produced one. Absent means
   * the download is not offered yet — never a broken link.
   */
  pdfUrl?: string;
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/**
 * Public-record context assembled around the seller's own listing.
 *
 * THIS IS THE PRODUCT (RESEARCH.md §1). A page with photos and a price is a
 * one-week build for anyone who wants to copy it. A page that knows the light
 * rail is six minutes' walk — routed, not straight-line — and that the
 * ownership history is what the Ministry of Transport holds, is months of
 * assembly and it compounds.
 *
 * Everything here is baked in at build time from our own Postgres. Government
 * endpoints are never queried while a page renders — they are slow,
 * rate-limited and occasionally down, and the page has a hard performance
 * floor (RESEARCH.md §4.5).
 *
 * Every block is OPTIONAL and missing data is normal, not an error. A listing
 * with no comparable sales renders without that block: not an empty block,
 * not a placeholder, not an apology (RESEARCH.md §4.6).
 */

/**
 * Attribution carried by every enriched item, individually.
 *
 * Not hoisted to the block: a school list synced last week and a transit
 * feed synced yesterday have different dates, and showing one date for both
 * would be exactly the kind of tidy lie §4.7 forbids.
 */
export interface Provenance {
  /** The body, by name: רשות המסים, משרד התחבורה, מנהל התכנון. */
  sourceName: string;
  /** When the record was current. Rendered after נכון ל־. */
  sourceDate: string;
}

// --- Property: proximity ----------------------------------------------------

/**
 * Transit modes, kept apart on purpose.
 *
 * Light rail must never be lumped in with bus. Proximity to the light rail is
 * one of the highest-value facts on a Tel Aviv page, and a page that calls the
 * red line "a bus stop" has thrown away the single thing the reader most
 * wanted to know.
 */
export type TransitMode = 'light_rail' | 'train' | 'metro' | 'bus';

export interface NearbyTransit extends Provenance {
  id: string;
  name: string;
  mode: TransitMode;
  /**
   * Route designations serving this stop, as STRINGS. Israeli routes include
   * 5א and 480, so a numeric type would silently drop half of them.
   */
  routes: string[];
  /** Routed on the pedestrian network by OSRM. Never straight-line. */
  walkMinutes: number;
}

export interface NearbySchool extends Provenance {
  id: string;
  name: string;
  /** Hebrew institution type, e.g. בית ספר יסודי, גן ילדים. */
  type: string;
  /** Supervision stream: ממלכתי, ממלכתי־דתי, חרדי, or what the register says. */
  stream: string;
  /** Hebrew grade span, e.g. א׳–ו׳. Absent for kindergartens. */
  gradeSpan?: string;
  walkMinutes: number;
}

export type PlaceCategory =
  | 'restaurant'
  | 'cafe'
  | 'grocery'
  | 'pharmacy'
  | 'park'
  | 'culture'
  | 'gym';

export interface NearbyPlace extends Provenance {
  id: string;
  name: string;
  category: PlaceCategory;
  walkMinutes: number;
}

/**
 * The headline numbers, so a reader gets the shape of a neighbourhood without
 * reading three lists.
 *
 * Every field is optional because every one of them can legitimately be
 * missing: a moshav has no grocery within walking distance, and saying so with
 * a zero would be a different claim than saying nothing.
 */
export interface ProximitySummary {
  /** Count, not a list. Nobody reads forty restaurants. */
  restaurantsWithin500m?: number;
  nearestGrocery?: { name: string; walkMinutes: number };
  nearestPark?: { name: string; walkMinutes: number };
}

/**
 * What is around this address.
 *
 * NOT what sold in this building — transactions are deferred to v2 and to
 * agents (RESEARCH.md §4.2). The chain here is address → coordinate → what is
 * nearby: one link, where the transaction chain was four.
 *
 * Every list is CAPPED and every list may be EMPTY. An empty one is omitted by
 * the page rather than rendered as a blank block, because a moshav listing
 * legitimately has no light rail and its page must look intentional rather
 * than broken.
 */
export interface PropertyEnrichment {
  category: 'property';
  transit: NearbyTransit[];
  schools: NearbySchool[];
  places: NearbyPlace[];
  summary: ProximitySummary;

  /**
   * Licence attributions that MUST be rendered wherever this data is shown.
   *
   * OpenStreetMap is ODbL: attribution is a condition of use, not a courtesy.
   * Carrying it in the payload rather than hardcoding it in the footer means a
   * page that drops the places block also drops its attribution, and a page
   * that gains a new ODbL source cannot forget to add one.
   */
  attributions: string[];
}

// --- Vehicle ----------------------------------------------------------------

/**
 * One ownership period from the Ministry of Transport history register.
 *
 * MONTHLY, not quarterly. RESEARCH.md §4.3 describes these as quarterly; the
 * register disagrees — `baalut_dt` comes back as `202202`, a year and a month.
 * Verified against resource bb2355dc on data.gov.il, 5,429,381 rows
 * (docs/DATA-SOURCES.md).
 *
 * Named for what it holds, because a field called fromQuarter carrying a month
 * would have quietly thrown away precision the state actually publishes — and
 * the loss would have been invisible at every later call site.
 */
export interface OwnershipPeriod extends Provenance {
  /** Hebrew ownership type: פרטית, חברה, ליסינג, השכרה, מונית, לימוד נהיגה. */
  type: string;
  /** Month the ownership began, as YYYY-MM. */
  fromMonth: string;
  /** Absent for the current owner. */
  toMonth?: string;
}

export interface VehicleEnrichment {
  category: 'vehicle';
  /**
   * Fact keys the plate lookup filled, so the page can render them under a
   * single verified heading without re-deriving which ones came from where.
   * The facts themselves stay in Listing.facts.
   */
  verifiedSpecKeys: string[];
  ownershipHistory: OwnershipPeriod[];
  /** ISO date. Also mirrored into a fact; here it drives the validity block. */
  testValidUntil?: string;
  /** Attribution for the verified specification as a whole. */
  specSource?: Provenance;
  /** Attribution for the test date. */
  testSource?: Provenance;
}

export type EnrichmentBlock = PropertyEnrichment | VehicleEnrichment;

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
  /**
   * Self-declared, unchecked against the Justice Ministry broker register.
   *
   * Renders as a plain, unstyled line in the seller block — never in the
   * agent bar, and never with the `מאומת` treatment a real register check
   * would earn. The Real Estate Brokers Regulations (2024) require a broker
   * to display their licence number on every advertisement (docs/
   * OPPORTUNITIES.md §1a); this is the agent's own legal declaration,
   * rendered as exactly that, not a claim this product is vouching for.
   */
  licenceNumber?: string;
}

/**
 * Who the seller is aiming this listing at.
 *
 * The two read the same page completely differently. A resident scans rooms,
 * floor and what the building has; an investor scans area, because the number
 * they actually compare between listings is price per m², and then the running
 * costs that decide the yield.
 *
 * Asked once in the editor rather than guessed, and rather than averaging the
 * two into a grid that serves neither. Defaults to 'resident': it is the
 * commoner case, and a resident reading an investor's grid is merely puzzled
 * where the reverse hides the number the reader came for.
 */
export type ListingAudience = 'resident' | 'investor';

export type ListingStatus = 'draft' | 'published' | 'sold' | 'archived';

/**
 * The page templates.
 *
 * An array with the union derived from it, not a bare union, for the same
 * reason BLOCKER_CODES is: a union exists only at compile time, and both the
 * picker that offers these and the draft validator that has to reject
 * anything else need to enumerate them at runtime. draft.ts previously
 * carried its own hand-written copy of this list, which is exactly the kind
 * of second definition that agrees right up until someone adds a template.
 */
export const TEMPLATE_IDS = ['agency', 'editorial', 'dark'] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/**
 * The accent this listing was published with.
 *
 * A COPY of the agent's choice at the time, not a live read of their profile
 * — same rule as `seller`. An agent who changes colour next year must not
 * silently repaint the pages they already sent.
 *
 * Optional, and absent means olive. Every listing made before 0011 has no
 * value and must keep looking exactly as it did.
 */
export type ListingAccent = string;

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
   * Public-record context, baked in at build time. Absent is the normal case
   * for a fresh listing and for anything the registers do not cover.
   */
  enrichment?: EnrichmentBlock;

  /**
   * Content hash of the generated Open Graph image, set by the Stage D
   * pipeline once it has produced /og/{slug}-{hash}.webp.
   *
   * ABSENT means no OG image has been generated yet, and the page falls back
   * to the cover photo so the WhatsApp card still carries a picture. A card
   * with no image is the worst outcome in the product — it is the difference
   * between someone tapping and not.
   */
  ogImageHash?: string;

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
  /** Absent means olive. See ListingAccent. */
  accent?: ListingAccent;

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

  /**
   * Who the seller is aiming this at. Defaults to 'resident' when absent.
   *
   * Reorders the facts grid — see orderForAudience. It is a question the
   * editor asks once, because a resident and an investor scan the same grid
   * for different numbers and averaging them serves neither.
   */
  audience?: ListingAudience;
}
