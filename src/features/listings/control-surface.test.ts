import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  locationPrecision,
  priceHeadline,
  publicPlace,
  showListingMap,
  whatsappPrefill,
} from './control-surface.js';
import type { ListingLocation } from '@/types/listing.js';

const city: ListingLocation = { city: 'חולון' };
const street: ListingLocation = { city: 'חולון', street: 'סוקולוב 12' };
const exact: ListingLocation = { city: 'תל אביב־יפו', street: 'דיזנגוף 99', lat: 32.08, lng: 34.77 };

describe('priceHeadline', () => {
  it('is an exact figure by default', () => {
    assert.deepEqual(priceHeadline(undefined), { showAmount: true });
  });

  it('prefixes a floor price', () => {
    assert.deepEqual(priceHeadline('from'), { showAmount: true, prefix: 'from' });
  });

  it('hides the number when the price is on request', () => {
    assert.deepEqual(priceHeadline('on_request'), { showAmount: false });
  });
});

describe('locationPrecision', () => {
  it('infers area, street, and exact from what the row holds', () => {
    assert.equal(locationPrecision(city), 'area');
    assert.equal(locationPrecision(street), 'street');
    assert.equal(locationPrecision(exact), 'exact');
  });

  it('lets an explicit area win even when a street exists', () => {
    assert.equal(locationPrecision({ ...exact, precision: 'area' }), 'area');
    assert.equal(publicPlace({ ...exact, precision: 'area' }), 'תל אביב־יפו');
    assert.equal(showListingMap({ ...exact, precision: 'area' }), false);
  });
});

describe('whatsappPrefill', () => {
  it('keeps the generic line when there is no place', () => {
    assert.equal(whatsappPrefill('property'), 'היי, ראיתי את הדירה ואשמח לפרטים');
  });

  it('puts the public place into the opening line', () => {
    assert.equal(
      whatsappPrefill('property', 'דיזנגוף 99, תל אביב־יפו'),
      'היי, ראיתי את הדירה בדיזנגוף 99, תל אביב־יפו ואשמח לפרטים',
    );
  });
});
