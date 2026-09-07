import type { ListingCategory } from '@app/features/listings/schemas';

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
  /** DESIGN-CONTRACT §5.1 — one decision, two values. */
  heroRatio: string;
  heroVeilPad: string;
  /** Fact keys, in order, for the one-line og:description. */
  ogFactKeys: string[];
  /** Opening WhatsApp message the buyer sends. */
  whatsappMessage: string;
}

export const CATEGORY_PRESENTATION: Record<ListingCategory, CategoryPresentation> = {
  property: {
    // A 4/5 frame suits a room: vertical, and it shows floor-to-ceiling.
    heroRatio: '4/5',
    heroVeilPad: '5rem',
    ogFactKeys: ['area_sqm', 'floor', 'elevator', 'balcony_sqm', 'parking', 'shelter'],
    whatsappMessage: 'היי, ראיתי את הדירה ואשמח לפרטים',
  },
  vehicle: {
    // A car is a wide object — a vertical frame either crops it or fills the
    // rest with asphalt. The shorter hero needs less gradient runway, which
    // is why the veil padding moves with the ratio.
    heroRatio: '4/3',
    heroVeilPad: '4.5rem',
    ogFactKeys: ['hand', 'mileage', 'gearbox', 'test_until'],
    whatsappMessage: 'היי, ראיתי את הרכב ואשמח לפרטים',
  },
};
