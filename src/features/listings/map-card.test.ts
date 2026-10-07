import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ListingLocation } from '../../types/listing.js';
import { googleMapsUrl, navigationTarget, wazeNavigateUrl } from './map-card.js';

describe('wazeNavigateUrl', () => {
  it('builds a Waze link from a finite coordinate and drops a bad one', () => {
    assert.equal(
      wazeNavigateUrl(32.0165, 34.7792),
      'https://waze.com/ul?ll=32.0165,34.7792&navigate=yes',
    );
    assert.equal(wazeNavigateUrl(Number.NaN, 34.7), undefined);
  });
});

describe('googleMapsUrl', () => {
  it('builds a Google Maps link from the same coordinate', () => {
    assert.equal(
      googleMapsUrl(32.0165, 34.7792),
      'https://maps.google.com/?q=32.0165,34.7792',
    );
  });
});

describe('navigationTarget', () => {
  const street: ListingLocation = {
    city: 'תל אביב',
    street: 'פלורנטין',
    precision: 'street',
    lat: 32.056,
    lng: 34.766,
  };

  it('sends the stored point at street precision and nothing for an area', () => {
    assert.deepEqual(navigationTarget(street), { lat: 32.056, lng: 34.766 });
    assert.equal(navigationTarget({ ...street, precision: 'area' }), undefined);
    assert.deepEqual(navigationTarget({ ...street, precision: 'exact' }), { lat: 32.056, lng: 34.766 });
  });
});
