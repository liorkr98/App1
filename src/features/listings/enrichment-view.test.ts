import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  enrichmentHasContent,
  leftoverCount,
  orderTransit,
} from './enrichment-view.js';
import type { NearbyTransit, PropertyEnrichment, VehicleEnrichment } from '@/types/listing.js';

const OSM = { sourceName: 'OpenStreetMap', sourceDate: '2026-09-01' } as const;

const stop = (partial: Pick<NearbyTransit, 'id' | 'name' | 'mode' | 'walkMinutes'>): NearbyTransit => ({
  routes: [],
  ...OSM,
  ...partial,
});

const emptyProperty = (): PropertyEnrichment => ({
  category: 'property',
  transit: [],
  schools: [],
  places: [],
  civic: [],
  summary: {},
  attributions: [],
});

describe('enrichmentHasContent', () => {
  it('omits a property block whose every group is empty', () => {
    assert.equal(enrichmentHasContent(emptyProperty()), false);
  });

  it('keeps a property block that has one transit stop', () => {
    const block = emptyProperty();
    block.transit = [stop({ id: 't', name: 'וולפסון', mode: 'light_rail', walkMinutes: 7 })];
    assert.equal(enrichmentHasContent(block), true);
  });

  it('omits a vehicle block with no register history and no test date', () => {
    const block: VehicleEnrichment = {
      category: 'vehicle',
      verifiedSpecKeys: [],
      ownershipHistory: [],
    };
    assert.equal(enrichmentHasContent(block), false);
  });

  it('keeps a vehicle block that has a test date', () => {
    const block: VehicleEnrichment = {
      category: 'vehicle',
      verifiedSpecKeys: [],
      ownershipHistory: [],
      testValidUntil: '2027-03',
    };
    assert.equal(enrichmentHasContent(block), true);
  });
});

describe('leftoverCount', () => {
  it('is the extras after the three rows on the phone', () => {
    assert.equal(leftoverCount(5, 3), 2);
    assert.equal(leftoverCount(3, 3), 0);
    assert.equal(leftoverCount(0, 3), 0);
  });
});

describe('orderTransit', () => {
  it('puts rail before a closer bus so the light rail cannot fall off the first three', () => {
    const ordered = orderTransit([
      stop({ id: 'b', name: 'אוטובוס', mode: 'bus', walkMinutes: 3 }),
      stop({ id: 'r', name: 'רכבת קלה', mode: 'light_rail', walkMinutes: 7 }),
      stop({ id: 't', name: 'רכבת', mode: 'train', walkMinutes: 18 }),
    ]);
    assert.deepEqual(
      ordered.map((item) => item.mode),
      ['light_rail', 'train', 'bus'],
    );
  });

  it('sorts each mode set by walking time', () => {
    const ordered = orderTransit([
      stop({ id: 'r2', name: 'רחוקה', mode: 'light_rail', walkMinutes: 12 }),
      stop({ id: 'r1', name: 'קרובה', mode: 'light_rail', walkMinutes: 6 }),
      stop({ id: 'b', name: 'אוטובוס', mode: 'bus', walkMinutes: 4 }),
    ]);
    assert.deepEqual(
      ordered.map((item) => item.walkMinutes),
      [6, 12, 4],
    );
  });
});
