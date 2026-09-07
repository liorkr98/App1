/**
 * Crockford base32 slugs.
 *
 * Five characters from a 32-symbol alphabet is 33.5 million combinations —
 * enough that a slug cannot be guessed by enumeration, which matters because
 * an unlisted page is the only privacy a seller who chose noindex has.
 *
 * Crockford excludes I, L, O and U: the first three because they are confused
 * with 1 and 0 when a seller reads a link aloud over the phone, and U so the
 * encoding cannot accidentally produce an obscenity.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SLUG_LENGTH = 5;

/** Generates a slug. Server-side only — never derive one from listing content. */
export function generateSlug(random: () => number = Math.random): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return slug;
}

/** Crockford decoding treats I and L as 1, and O as 0. */
export function normaliseSlug(input: string): string {
  return input
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/-/g, '');
}

export function isValidSlug(input: string): boolean {
  const normalised = normaliseSlug(input);
  if (normalised.length !== SLUG_LENGTH) return false;
  return [...normalised].every((character) => ALPHABET.includes(character));
}
