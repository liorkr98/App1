/**
 * Listing slugs: five characters of Crockford base32, generated server-side.
 *
 * The alphabet is Crockford's precisely because of what it leaves out — I, L,
 * O and U. The first three are unreadable next to 1 and 0 in a URL somebody
 * reads aloud over the phone, and U is dropped to avoid accidental obscenities.
 * `supabase/migrations/0002_listings.sql` enforces the same set in a CHECK
 * constraint, and the two must not drift.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A SECURITY NOTE THAT NEEDS A DECISION — read before relying on this
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 0002 says privacy comes "from the unguessable slug and from indexable".
 * Five characters is 32^5 = 33,554,432 possibilities, and that number is too
 * small twice over. Both figures below were computed, not estimated.
 *
 * ENUMERATION. At a modest 100 requests a second the whole space is walkable
 * in 3.9 days, and published pages are readable by anon under
 * `listings_select_public`.
 *
 * So a determined party can harvest every published listing — addresses,
 * photographs, phone numbers — regardless of the noindex flag. For an agent
 * who wants the traffic that is a non-issue. For a private seller who chose
 * noindex specifically so their home address is not searchable, it is a
 * weaker guarantee than the comment in 0002 implies.
 *
 * COLLISION. Worse, and it arrives far sooner than the enumeration risk:
 *
 *       1,000 listings   1.5% chance of a collision
 *       5,000 listings    31%
 *      26,000 listings    effectively certain
 *
 * The primary audience is 22,995 licensed brokers. At that scale the unique
 * index in 0002 is not a safety net that occasionally fires — it is load
 * bearing, and generation must retry.
 *
 * Eight characters (32^8 ≈ 1.1e12) removes both problems and makes the URL
 * three characters longer. That is the recommendation.
 *
 * NOT changed unilaterally: the slug is in every shared link and its length is
 * a product decision about how a URL reads aloud. Flagged rather than silently
 * accepted or silently fixed.
 */

/** Crockford base32: no I, L, O or U. Must match the CHECK in 0002. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const SLUG_LENGTH = 5;

/** The same set the migration enforces, as a pattern for validation. */
export const SLUG_PATTERN = /^[0-9A-HJKMNP-TV-Z]{5}$/;

/**
 * Random bytes. Injectable so the tests can be deterministic without the
 * generator itself knowing anything about testing.
 */
export type RandomBytes = (count: number) => Uint8Array;

/**
 * Generates one slug.
 *
 * `byte % 32` is unbiased here and that is not an accident: 32 divides 256
 * exactly, so every character is equally likely. The same code with a 36 or 62
 * character alphabet would be subtly skewed toward the start of the alphabet,
 * which is the classic way a "random" identifier ends up guessable.
 */
export function generateSlug(randomBytes: RandomBytes): string {
  const bytes = randomBytes(SLUG_LENGTH);

  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const byte = bytes[i] ?? 0;
    slug += ALPHABET[byte % ALPHABET.length];
  }

  return slug;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Total slug space. Exported so the entropy question above can be asserted
 * rather than argued about.
 */
export const SLUG_SPACE = ALPHABET.length ** SLUG_LENGTH;

/**
 * Rough probability that at least two of `count` slugs collide.
 *
 * The birthday approximation, good enough to answer "how many listings before
 * we need to care". The answer at five characters is: sooner than you would
 * guess. A 1% chance arrives around a THOUSAND listings, not the tens of
 * thousands intuition suggests, which is why this function exists as
 * executable arithmetic rather than a sentence someone can misremember — as
 * the first draft of this comment did.
 */
export function collisionProbability(count: number): number {
  if (count < 2) return 0;
  return 1 - Math.exp((-count * (count - 1)) / (2 * SLUG_SPACE));
}
