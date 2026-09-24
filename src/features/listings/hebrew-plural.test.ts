import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  floorPhrase,
  minutePhrase,
  photoPhrase,
  roomPhrase,
  walkMinuteParts,
  walkPhrase,
} from './hebrew-plural.js';

describe('hebrew plurals', () => {
  it('agrees minutes: one, two, other', () => {
    assert.equal(minutePhrase(1), 'דקה אחת');
    assert.equal(minutePhrase(2), 'שתי דקות');
    assert.equal(minutePhrase(3), '3 דקות');
    assert.equal(walkPhrase(1), 'דקה אחת הליכה');
    assert.equal(walkPhrase(7), '7 דקות הליכה');
  });

  it('keeps the digit out of the one and two forms', () => {
    assert.deepEqual(walkMinuteParts(1), { words: 'דקה אחת' });
    assert.deepEqual(walkMinuteParts(2), { words: 'שתי דקות' });
    assert.deepEqual(walkMinuteParts(4), { digit: 4, noun: 'דקות' });
  });

  it('agrees rooms, floors and photos the same way', () => {
    assert.equal(roomPhrase(1), 'חדר אחד');
    assert.equal(roomPhrase(2), 'שני חדרים');
    assert.equal(roomPhrase(4), '4 חדרים');
    assert.equal(floorPhrase(1), 'קומה אחת');
    assert.equal(floorPhrase(2), 'שתי קומות');
    assert.equal(floorPhrase(5), '5 קומות');
    assert.equal(photoPhrase(1), 'תמונה אחת');
    assert.equal(photoPhrase(2), 'שתי תמונות');
    assert.equal(photoPhrase(14), '14 תמונות');
  });
});
