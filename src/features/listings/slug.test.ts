import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALPHABET,
  collisionProbability,
  generateSlug,
  isValidSlug,
  SLUG_LENGTH,
  SLUG_SPACE,
} from './slug.js';

/** Deterministic bytes, so a generator test is not itself random. */
const bytesFrom = (values: number[]) => (count: number) =>
  Uint8Array.from(Array.from({ length: count }, (_, i) => values[i % values.length] ?? 0));

describe('the alphabet', () => {
  it('is Crockford base32 — 32 characters, no I, L, O or U', () => {
    // I and L are unreadable next to 1, O next to 0, in a URL somebody reads
    // aloud over the phone. U is dropped to avoid accidental obscenities.
    assert.equal(ALPHABET.length, 32);
    for (const excluded of ['I', 'L', 'O', 'U']) {
      assert.ok(!ALPHABET.includes(excluded), `${excluded} should be excluded`);
    }
  });

  it('has no duplicate characters', () => {
    assert.equal(new Set(ALPHABET).size, ALPHABET.length);
  });

  it('matches the CHECK constraint in migration 0002 character for character', () => {
    // If these drift, the generator produces slugs the database rejects — at
    // publish time, which is the worst possible moment to find out.
    for (const character of ALPHABET) {
      assert.ok(isValidSlug(character.repeat(SLUG_LENGTH)), `${character} rejected`);
    }
  });

  it('divides 256 exactly, so byte % 32 is unbiased', () => {
    // The reason this alphabet size is safe with modulo. A 36 or 62 character
    // alphabet with the same code would skew toward the start of the
    // alphabet, which is how a "random" identifier becomes guessable.
    assert.equal(256 % ALPHABET.length, 0);
  });
});

describe('generateSlug', () => {
  it('produces a slug of the right length and shape', () => {
    const slug = generateSlug(bytesFrom([0, 1, 2, 3, 4]));

    assert.equal(slug.length, SLUG_LENGTH);
    assert.ok(isValidSlug(slug), slug);
  });

  it('maps bytes onto the alphabet by modulo', () => {
    assert.equal(generateSlug(bytesFrom([0, 1, 2, 3, 4])), '01234');
  });

  it('wraps past 32 without leaving the alphabet', () => {
    // 32 % 32 = 0, 33 % 32 = 1. The wrap is what makes every character
    // equally likely.
    assert.equal(generateSlug(bytesFrom([32, 33, 34, 35, 36])), '01234');
    // 255 % 32 = 31, the last character of the alphabet.
    assert.equal(generateSlug(bytesFrom([255, 255, 255, 255, 255])), 'ZZZZZ');
  });

  it('always emits something the database will accept', () => {
    // Every byte value, exhaustively — not a sample.
    for (let byte = 0; byte < 256; byte += 1) {
      const slug = generateSlug(bytesFrom([byte]));
      assert.ok(isValidSlug(slug), `byte ${byte} produced ${slug}`);
    }
  });
});

describe('isValidSlug', () => {
  it('accepts the sample slugs the fixtures use', () => {
    assert.ok(isValidSlug('A7K2M'));
    assert.ok(isValidSlug('V3M9Q'));
  });

  it('rejects the excluded letters', () => {
    for (const excluded of ['I', 'L', 'O', 'U']) {
      assert.ok(!isValidSlug(`${excluded}7K2M`), excluded);
    }
  });

  it('rejects the wrong length and lower case', () => {
    assert.ok(!isValidSlug('A7K2'));
    assert.ok(!isValidSlug('A7K2MM'));
    assert.ok(!isValidSlug('a7k2m'));
    assert.ok(!isValidSlug(''));
  });
});

describe('the entropy problem, as arithmetic rather than opinion', () => {
  it('has a space of 33,554,432', () => {
    assert.equal(SLUG_SPACE, 33_554_432);
  });

  it('collides sooner than intuition suggests', () => {
    // This is the assertion that matters. The first draft of the comment in
    // slug.ts claimed a 1% chance around 26,000 listings. It is around a
    // THOUSAND — and by 26,000 a collision is effectively certain.
    assert.ok(collisionProbability(1_000) > 0.01, 'should exceed 1% by a thousand listings');
    assert.ok(collisionProbability(5_000) > 0.3, 'should exceed 30% by five thousand');
    assert.ok(collisionProbability(26_000) > 0.99, 'should be near-certain by 26,000');
  });

  it('is why the unique index in 0002 is load bearing', () => {
    // The primary audience is 22,995 licensed brokers. At that scale the
    // index is not a safety net that occasionally fires, and generation must
    // retry rather than assume success.
    assert.ok(collisionProbability(22_995) > 0.99);
  });

  it('is zero below two listings', () => {
    assert.equal(collisionProbability(0), 0);
    assert.equal(collisionProbability(1), 0);
  });
});
