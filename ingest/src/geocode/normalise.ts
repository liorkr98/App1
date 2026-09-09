/**
 * Israeli address normalisation, before geocoding.
 *
 * This is the part of geocoding that is actually hard, and it is hard for a
 * specific reason: Israeli addresses are written a dozen ways and every one of
 * them is what somebody typed into a form.
 *
 *   שד' ירושלים 12    שדרות ירושלים 12    שד ירושלים 12
 *   רח' הרצל 5        רחוב הרצל 5         הרצל 5
 *
 * All one address. Hand any of the unnormalised forms to a geocoder and it
 * either misses or — worse — matches a different street with a similar name.
 *
 * Pure and dependency-free so the variant handling can be tested exhaustively,
 * which is the only way to know which forms are covered. The list of what is
 * NOT handled is at the bottom of this file, deliberately, because that is the
 * part that decides coverage.
 */

/**
 * Apostrophe-like characters that all mean geresh.
 *
 * Hebrew abbreviations end in geresh (U+05F3), but a phone keyboard produces
 * ASCII apostrophe and iOS substitutes a right single quote. All three appear
 * in real submissions and none of them match each other.
 */
const GERESH_LIKE = /['\u2018\u2019\u05F3\u00B4\u0060]/g;

/** Same problem for gershayim (U+05F4), used in two-letter abbreviations. */
const GERSHAYIM_LIKE = /["\u201C\u201D\u05F4]/g;

/** Bidi controls and zero-width marks, which survive copy-paste invisibly. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Street-type prefixes, abbreviated and full.
 *
 * These are DROPPED, not expanded. A geocoder matches "ירושלים" against a
 * street index that already knows it is a boulevard; leaving "שדרות" in place
 * only adds a token that has to match. Dropping is both simpler and more
 * forgiving.
 *
 * Order matters: the longer forms must be tried first, or "שד" matches inside
 * "שדרות" and leaves "רות" behind.
 */
const STREET_PREFIXES = [
  'שדרות',
  'רחוב',
  'סמטת',
  'סמטה',
  'משעול',
  'דרך',
  'כיכר',
  'שד',
  'רח',
  'סמ',
];

/**
 * Fragments that describe a unit inside a building rather than the building.
 *
 * A geocoder cannot use them and they actively hurt: "הרצל 5 דירה 12" scores
 * worse against "הרצל 5" than the bare form does.
 */
const UNIT_FRAGMENTS = [
  'דירה',
  'דירת',
  'כניסה',
  'קומה',
  'ת.ד',
  'תד',
  'בניין',
  'בנין',
  'מגדל',
];

export interface NormalisedAddress {
  /** What to send to the geocoder. */
  query: string;
  /** Street name with the type prefix removed. */
  street: string;
  /** House number, when one could be found. */
  houseNumber?: string;
  city: string;
}

/** Collapses the quote and whitespace variants that break naive matching. */
export function normaliseText(input: string): string {
  return input
    .replace(INVISIBLE, '')
    .replace(GERESH_LIKE, '׳')
    .replace(GERSHAYIM_LIKE, '״')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes a leading street-type word, abbreviated or not.
 *
 * The abbreviated forms may or may not carry a geresh — `שד׳`, `שד`, and
 * `שד.` all occur — so the trailing punctuation is optional in the match.
 */
export function stripStreetPrefix(street: string): string {
  for (const prefix of STREET_PREFIXES) {
    const pattern = new RegExp(`^${prefix}[\\u05F3.]?\\s+`, 'u');
    if (pattern.test(street)) return street.replace(pattern, '').trim();
  }
  return street.trim();
}

/** Drops everything from the first unit fragment onwards. */
export function stripUnit(street: string): string {
  for (const fragment of UNIT_FRAGMENTS) {
    const index = street.indexOf(fragment);
    if (index > 0) return street.slice(0, index).trim();
  }
  return street;
}

/**
 * Takes the first street of a corner description.
 *
 * "הרצל פינת אלנבי" is a junction, not an address. The first street plus a
 * house number is the closest thing to a point; the second is context a
 * geocoder will only be confused by.
 */
export function stripCorner(street: string): string {
  const marker = street.indexOf('פינת');
  return marker > 0 ? street.slice(0, marker).trim() : street;
}

/**
 * Splits a trailing house number off the street name.
 *
 * Israeli house numbers can carry a letter — 12א, 5ב — and sometimes a range
 * or a slash for a sub-unit: 12/3. The letter is kept because it distinguishes
 * real buildings; the slashed sub-unit is dropped because it is a flat.
 */
export function splitHouseNumber(street: string): { street: string; houseNumber?: string } {
  const match = /^(.*?)[\s,]+(\d+[\u0590-\u05FF]?)(?:\s*\/\s*\d+)?$/u.exec(street.trim());

  if (!match?.[1] || !match[2]) return { street: street.trim() };
  return { street: match[1].trim(), houseNumber: match[2] };
}

/**
 * The whole pipeline, in the order the transformations have to happen.
 *
 * Unit fragments go before the house number: "הרצל 5 דירה 12" must not have
 * "12" read as the building.
 */
export function normaliseAddress(rawStreet: string, rawCity: string): NormalisedAddress {
  const city = normaliseText(rawCity);

  let street = normaliseText(rawStreet);
  street = stripUnit(street);
  street = stripCorner(street);
  street = stripStreetPrefix(street);

  const { street: name, houseNumber } = splitHouseNumber(street);

  const query = [name, houseNumber, city].filter(Boolean).join(' ');

  return {
    query,
    street: name,
    ...(houseNumber === undefined ? {} : { houseNumber }),
    city,
  };
}

/**
 * WHAT THIS DOES NOT HANDLE — read before trusting a coverage number.
 *
 * - **Neighbourhood-only addresses.** "פלורנטין, תל אביב" has no street and no
 *   number. It geocodes to a neighbourhood centroid, which is fine for
 *   proximity but must never be presented as the property's location.
 * - **Misspellings.** No fuzzy matching. "סוקולוב" typed "סוקולב" will miss.
 *   Fuzzy matching against a street index is a real piece of work and it
 *   belongs after we know the miss rate, not before.
 * - **Arabic-script addresses.** Israeli addresses in Arabic are a genuine
 *   case and none of the above touches them.
 * - **Kibbutz and moshav addresses**, which frequently have no street at all —
 *   just a settlement name and sometimes a house number.
 * - **Building names** used instead of numbers ("מגדל אלרוב").
 * - **Second street of a corner**, deliberately discarded.
 *
 * Each of these is a miss, not a wrong answer — the geocoder returns nothing
 * and the listing publishes without proximity enrichment, which C8 already
 * requires to look intentional.
 */
