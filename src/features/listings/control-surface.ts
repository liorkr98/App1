import type { ListingLocation } from '@/types/listing.js';

export type PriceDisplay = 'exact' | 'from' | 'on_request';
export type LocationPrecision = 'exact' | 'street' | 'area';

export interface PriceHeadline {
  /** Show the shekel amount. False for לפי פנייה. */
  showAmount: boolean;
  /** החל מ־ when the agent chose a floor, not a figure. */
  prefix?: 'from';
}

export function priceHeadline(display: PriceDisplay | undefined): PriceHeadline {
  if (display === 'on_request') return { showAmount: false };
  if (display === 'from') return { showAmount: true, prefix: 'from' };
  return { showAmount: true };
}

/**
 * The price fragment of og:title. לפי פנייה hides the number — the card
 * is what a buyer sees in WhatsApp before they tap, and a figure the
 * page then refuses to print is a lie on that card.
 */
export function ogPriceFragment(
  price: number,
  display: PriceDisplay | undefined,
  formatted: string,
  fromPrefix: string,
): string {
  const headline = priceHeadline(display);
  if (!headline.showAmount || price <= 0) return '';
  return headline.prefix === 'from' ? ` · ${fromPrefix}${formatted}` : ` · ${formatted}`;
}

/**
 * How publicly the address may be named.
 *
 * An explicit precision always wins. Otherwise coords+street is a pin,
 * a street without coords is a street line, and a city is an area.
 */
export function locationPrecision(location: ListingLocation): LocationPrecision {
  if (location.precision) return location.precision;
  if (location.street && location.lat != null && location.lng != null) return 'exact';
  if (location.street) return 'street';
  return 'area';
}

/** What the page may print. Area never leaks the street. */
export function publicPlace(location: ListingLocation): string {
  const precision = locationPrecision(location);
  if (precision === 'area' || !location.street) return location.city;
  return `${location.street}, ${location.city}`;
}

export function showListingMap(location: ListingLocation | undefined): boolean {
  if (!location?.street) return false;
  return locationPrecision(location) !== 'area';
}

/**
 * Opening WhatsApp line. The place is interpolated so the agent does not
 * type the address into every send — the page already knows it.
 */
export function whatsappPrefill(category: 'property' | 'vehicle', place?: string): string {
  const noun = category === 'property' ? 'הדירה' : 'הרכב';
  return place
    ? `היי, ראיתי את ${noun} ב${place} ואשמח לפרטים`
    : `היי, ראיתי את ${noun} ואשמח לפרטים`;
}
