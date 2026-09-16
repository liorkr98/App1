import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parkingToItm, plausibleItm, type ParkingRow } from './parking.js';

const sample = (over: Partial<ParkingRow> = {}): ParkingRow => ({
  _id: 1,
  UNIQ_ID: '51590923',
  NAME: 'חניה ציבורית ללא תשלום',
  SETL_NAME: 'דימונה',
  X: '202611.84072700000',
  Y: '553525.14169399999',
  ...over,
});

describe('parkingToItm', () => {
  it('passes ITM metres through and does not invent WGS84', () => {
    const site = parkingToItm(sample());
    assert.ok(site);
    assert.equal(site.site_id, 'parking-51590923');
    assert.equal(site.kind, 'parking');
    assert.equal(site.name, 'חניה ציבורית ללא תשלום, דימונה');
    assert.equal(site.x, 202611.840727);
    assert.ok(site.y > 553525 && site.y < 553526);
    assert.equal('geom' in site, false);
    assert.equal('lon' in site, false);
  });

  it('drops a swapped or missing coordinate', () => {
    assert.equal(parkingToItm(sample({ X: 34.8, Y: 32.0 })), undefined);
    assert.equal(parkingToItm(sample({ UNIQ_ID: '' })), undefined);
  });
});

describe('plausibleItm', () => {
  it('accepts Dimona parking and rejects WGS84 numbers', () => {
    assert.equal(plausibleItm(202611.84, 553525.14), true);
    assert.equal(plausibleItm(34.8, 32.0), false);
  });
});
