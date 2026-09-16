import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parkRideToItm, type ParkRideRow } from './park-ride.js';

const sample = (over: Partial<ParkRideRow> = {}): ParkRideRow => ({
  _id: 1,
  ID: 1.0,
  NAME: 'מ.א. אשכול',
  STATUS: 'קיים',
  X: 145896.99,
  Y: 579227.04,
  ...over,
});

describe('parkRideToItm', () => {
  it('keeps open lots as ITM and truncates a float id', () => {
    const site = parkRideToItm(sample());
    assert.ok(site);
    assert.equal(site.site_id, 'parkride-1');
    assert.equal(site.kind, 'park_ride');
    assert.equal(site.name, 'מ.א. אשכול');
    assert.equal(site.x, 145896.99);
    assert.equal('geom' in site, false);
  });

  it('drops a planned lot', () => {
    assert.equal(parkRideToItm(sample({ STATUS: 'מתוכנן' })), undefined);
  });
});
