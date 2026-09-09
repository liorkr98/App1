import type { ListingCategory } from '@/features/listings/schemas';

/**
 * The ONLY place a category name selects a presentation value.
 *
 * DESIGN-CONTRACT §5 allows four divergences between the two templates.
 * Three of them are driven by data and need nothing here:
 *
 *   #2 price note   PriceBar branches on listPrice being present
 *   #3 disclosures  rendered when listing.disclosures is non-empty
 *   #4 map          rendered when location.street is present
 *
 * Only #1 — the hero block — is genuinely category-shaped, and both of its
 * values live in one object below so nobody can change the ratio and forget
 * the padding.
 *
 * A fifth divergence would have to be added here deliberately, and CI checks
 * that none has been (scripts/verify-template-divergences.mjs).
 */
export interface CategoryPresentation {
  /**
   * DESIGN-CONTRACT §5.1 — divergence #1, now ONE value rather than two.
   *
   * The B2 revision made the hero full-bleed at a viewport height instead of
   * a cropped aspect-ratio, so the veil padding no longer moves with it: the
   * gradient runway is fixed at 7rem for both. What still differs is how much
   * of the first screen the photograph takes.
   */
  heroHeight: string;
  /** Fact keys, in order, for the one-line og:description. */
  ogFactKeys: string[];
  /** Opening WhatsApp message the buyer sends. */
  whatsappMessage: string;
}

export const CATEGORY_PRESENTATION: Record<ListingCategory, CategoryPresentation> = {
  property: {
    // A room rewards height: 84svh shows floor-to-ceiling and makes the
    // photograph the whole first screen, which is the point of the revision.
    heroHeight: '84svh',
    ogFactKeys: ['area_sqm', 'floor', 'elevator', 'balcony_sqm', 'parking', 'shelter'],
    whatsappMessage: 'היי, ראיתי את הדירה ואשמח לפרטים',
  },
  vehicle: {
    // A car is a wide object. The rationale is unchanged from the aspect-ratio
    // era — a tall frame either crops the car or fills the rest with asphalt —
    // and it now expresses itself as a shorter hero rather than a wider crop.
    heroHeight: '64svh',
    ogFactKeys: ['hand', 'mileage', 'gearbox', 'test_until'],
    whatsappMessage: 'היי, ראיתי את הרכב ואשמח לפרטים',
  },
};
