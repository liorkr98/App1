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
/**
 * The street as the public may see it: the street, never the building.
 *
 * Decided 7 Oct 2026 ("no location", restated by the agent): a published page
 * shows the street area only. The house number is the one part of an address
 * that turns "a flat on Herzl" into "this door", and a seller who wants buyers
 * at a viewing tells them the number on the phone. So it is taken off every
 * public surface — page, WhatsApp card, story, flyer, preview — while the row
 * keeps what was typed, because the neighbourhood lookup needs the street.
 *
 * Handles `43`, `43א`, `43/2`, `43-45`, `מס' 43` and `43 ב`; a street whose
 * name is itself a number (`רחוב 10`, `שדרות 2000`) is left alone only when
 * removing the number would leave nothing but the prefix.
 */
export function publicStreet(street: string): string {
  const tidy = street.replace(/\s+/g, ' ').trim();
  const bare = tidy
    .replace(/[\s,]*(?:מס['׳]?\s*)?\d+\s*[א-ת]?(?:\s*[/\-–]\s*\d+\s*[א-ת]?)?\s*$/u, '')
    .replace(/[\s,]+$/u, '')
    .trim();
  if (!bare || /^(?:רחוב|רח['׳]?|שדרות|שד['׳]?|דרך|סמטת|סמ['׳]?)$/u.test(bare)) return tidy;
  return bare;
}

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
