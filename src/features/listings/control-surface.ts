import type { Fact, ListingLocation } from '@/types/listing.js';

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
 * type the address into every send — the page already knows it. With a
 * name (listingShortName, 19 Oct 2026) the agent also knows which listing
 * the message is about without asking: an agent with ten live pages gets
 * ten identical "ראיתי את הדירה" otherwise.
 */
export function whatsappPrefill(category: 'property' | 'vehicle', place?: string, name?: string): string {
  const noun = name ?? (category === 'property' ? 'הדירה' : 'הרכב');
  return place
    ? `היי, ראיתי את ${noun} ב${place} ואשמח לפרטים`
    : `היי, ראיתי את ${noun} ואשמח לפרטים`;
}

/**
 * The second button's line (extras.visit): a visit to a flat, a test drive
 * of a car. The same name and place as the first.
 */
export function visitPrefill(category: 'property' | 'vehicle', place?: string, name?: string): string {
  const noun = name ?? (category === 'property' ? 'הדירה' : 'הרכב');
  const what = category === 'property' ? 'ביקור' : 'נסיעת מבחן';
  return place ? `היי, אשמח לתאם ${what} — ${noun} ב${place}` : `היי, אשמח לתאם ${what} — ${noun}`;
}

/**
 * The message a WhatsApp tap opens with, written by the hop (/a/{slug}/wa)
 * rather than carried in the page's links (19 Oct 2026). A link that carried
 * it put about 200 bytes of percent-encoded Hebrew into every one of a
 * page's three WhatsApp links, and let anyone write a message into the
 * agent's chat through our domain. `visit` is the second button (0047).
 */
export function listingPrefill(
  listing: { category: 'property' | 'vehicle'; facts: readonly Fact[]; location?: ListingLocation | undefined },
  kind: 'ask' | 'visit',
): string {
  const place = listing.location ? publicPlace(listing.location) : undefined;
  const name = listingShortName(listing.category, listing.facts);
  return kind === 'visit' ? visitPrefill(listing.category, place, name) : whatsappPrefill(listing.category, place, name);
}

const answer = (facts: readonly Fact[], key: string): string | undefined => {
  const fact = facts.find((candidate) => candidate.key === key && candidate.present !== false);
  const value = fact?.value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

/**
 * What the listing is, in a few words, from the seller's answers: "מאזדה 3
 * 2009", "דירת 4 חדרים". Never the plate (it is not a fact a name is made
 * of) and never a number the facts do not hold. Undefined when too little
 * was answered: the plain noun is better than half a name.
 */
export function listingShortName(category: 'property' | 'vehicle', facts: readonly Fact[]): string | undefined {
  if (category === 'vehicle') {
    const make = answer(facts, 'make');
    if (!make) return undefined;
    return [make, answer(facts, 'model'), answer(facts, 'year')].filter(Boolean).join(' ');
  }
  const rooms = answer(facts, 'rooms');
  return rooms ? `דירת ${rooms} חדרים` : undefined;
}
