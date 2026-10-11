import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import { autoTitle } from './auto-title.js';

const fact = (key: string, value: Fact['value'], extra: Partial<Fact> = {}): Fact => ({
  key,
  label: key,
  value,
  type: typeof value === 'number' ? 'number' : 'text',
  present: true,
  required: false,
  source: 'seller',
  ...extra,
});

describe('autoTitle', () => {
  it('names a flat by its rooms and its city', () => {
    assert.equal(autoTitle('property', [fact('rooms', 4)], 'תל אביב'), 'דירת 4 חדרים בתל אביב');
    assert.equal(autoTitle('property', [fact('rooms', 3.5)], 'חיפה'), 'דירת 3.5 חדרים בחיפה');
    assert.equal(autoTitle('property', [fact('rooms', 1)], 'חיפה'), 'דירת חדר בחיפה');
  });

  it('says only what was answered', () => {
    assert.equal(autoTitle('property', [], 'חיפה'), 'דירה בחיפה');
    assert.equal(autoTitle('property', [fact('rooms', 4)]), 'דירת 4 חדרים');
    assert.equal(autoTitle('property', [fact('rooms', null, { present: false })]), '');
  });

  it('names a car by make, model and year', () => {
    assert.equal(
      autoTitle('vehicle', [fact('make', 'מאזדה'), fact('model', '3'), fact('year', 2019)]),
      'מאזדה 3 2019',
    );
    assert.equal(autoTitle('vehicle', [fact('make', 'מאזדה')]), 'מאזדה');
    assert.equal(autoTitle('vehicle', []), '');
  });

  it('never carries a street, so never a house number', () => {
    assert.equal(autoTitle('property', [fact('rooms', 4)], 'תל אביב').includes('הקישון'), false);
  });
});
