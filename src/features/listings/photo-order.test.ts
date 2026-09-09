import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  coverOf,
  indexFromPointer,
  moveItem,
  publishedOrder,
  type Direction,
} from './photo-order.js';

/**
 * The test the brief asks for by name: reorder four photos and assert the
 * PUBLISHED order — not the visual one.
 *
 * The distinction is the whole point. A gallery that looks right in an RTL
 * browser while publishing the wrong cover is exactly the failure mode, and it
 * is invisible until a seller has already sent the link.
 */

const PHOTOS = ['סלון', 'מטבח', 'חדר שינה', 'מרפסת'] as const;

describe('moveItem', () => {
  it('moves a photo to the front, making it the cover', () => {
    const next = moveItem(PHOTOS, 2, 0);

    assert.deepEqual(next, ['חדר שינה', 'סלון', 'מטבח', 'מרפסת']);
    assert.equal(coverOf(next), 'חדר שינה');
  });

  it('moves a photo to the end', () => {
    assert.deepEqual(moveItem(PHOTOS, 0, 3), ['מטבח', 'חדר שינה', 'מרפסת', 'סלון']);
  });

  it('moves backwards as well as forwards', () => {
    assert.deepEqual(moveItem(PHOTOS, 3, 1), ['סלון', 'מרפסת', 'מטבח', 'חדר שינה']);
  });

  it('is a no-op when nothing moved', () => {
    assert.deepEqual(moveItem(PHOTOS, 1, 1), [...PHOTOS]);
  });

  it('treats a drag past the end as "put it last"', () => {
    // An ordinary gesture, not an error.
    assert.deepEqual(moveItem(PHOTOS, 0, 99), ['מטבח', 'חדר שינה', 'מרפסת', 'סלון']);
  });

  it('does not mutate the input', () => {
    const original = [...PHOTOS];
    moveItem(original, 0, 3);
    assert.deepEqual(original, [...PHOTOS]);
  });
});

describe('indexFromPointer — the RTL trap', () => {
  // Four photos across a 400px strip: one slot per 100px.
  const WIDTH = 400;
  const COUNT = 4;

  it('maps the LEFT edge to the LAST photo under RTL', () => {
    // The assertion that catches the bug. Under `direction: rtl` the flow is
    // reversed, so x=0 is where the last item sits — not the first.
    assert.equal(indexFromPointer(10, WIDTH, COUNT, 'rtl'), 3);
  });

  it('maps the RIGHT edge to the FIRST photo under RTL', () => {
    // Index 0 is on the right. This is the rule, stated as a test.
    assert.equal(indexFromPointer(390, WIDTH, COUNT, 'rtl'), 0);
  });

  it('maps every slot correctly under RTL', () => {
    assert.deepEqual(
      [50, 150, 250, 350].map((x) => indexFromPointer(x, WIDTH, COUNT, 'rtl')),
      [3, 2, 1, 0],
    );
  });

  it('maps every slot correctly under LTR, for contrast', () => {
    assert.deepEqual(
      [50, 150, 250, 350].map((x) => indexFromPointer(x, WIDTH, COUNT, 'ltr')),
      [0, 1, 2, 3],
    );
  });

  it('is the exact mirror of LTR', () => {
    // If this ever stops holding, one of the two directions has been changed
    // without the other.
    for (const x of [0, 37, 99, 100, 199, 200, 333, 399]) {
      const rtl = indexFromPointer(x, WIDTH, COUNT, 'rtl');
      const ltr = indexFromPointer(x, WIDTH, COUNT, 'ltr');
      assert.equal(rtl, COUNT - 1 - ltr, `mismatch at x=${x}`);
    }
  });

  it('clamps a pointer past either edge', () => {
    assert.equal(indexFromPointer(-50, WIDTH, COUNT, 'rtl'), 3);
    assert.equal(indexFromPointer(9999, WIDTH, COUNT, 'rtl'), 0);
  });

  it('survives a zero-width container without dividing by zero', () => {
    assert.equal(indexFromPointer(10, 0, COUNT, 'rtl'), 0);
    assert.equal(indexFromPointer(10, WIDTH, 0, 'rtl'), 0);
  });
});

describe('a full RTL reorder, end to end', () => {
  /**
   * The scenario the brief describes: a seller on a phone, in Hebrew, drags
   * the balcony photo to the front to make it the cover.
   *
   * Visually they drag it to the RIGHTMOST slot, because that is where the
   * first item lives. The published array must start with מרפסת.
   */
  it('publishes the order the seller arranged, not its mirror', () => {
    const direction: Direction = 'rtl';
    const width = 400;

    // מרפסת is at model index 3 — visually the leftmost slot.
    const from = indexFromPointer(50, width, PHOTOS.length, direction);
    assert.equal(from, 3, 'the leftmost slot should be the last photo');

    // They drag it to the rightmost slot, which is where the cover lives.
    const to = indexFromPointer(390, width, PHOTOS.length, direction);
    assert.equal(to, 0, 'the rightmost slot should be the cover position');

    const reordered = moveItem(PHOTOS, from, to);
    const published = publishedOrder(reordered);

    assert.deepEqual(published, ['מרפסת', 'סלון', 'מטבח', 'חדר שינה']);
    assert.equal(coverOf(published), 'מרפסת');
  });

  it('does not reverse the array on the way to publication', () => {
    // The tempting "fix" for an RTL gallery that looks wrong is to reverse
    // before saving. That flips the cover while making the editor look
    // correct — the worst of both.
    const published = publishedOrder([...PHOTOS]);

    assert.deepEqual(published, [...PHOTOS]);
    assert.equal(coverOf(published), 'סלון');
  });
});
