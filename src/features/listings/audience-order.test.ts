import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orderForAudience } from './audience-order.js';

const cell = (key: string) => ({ key });
const keys = (items: { key: string }[]) => items.map((item) => item.key);

const grid = [
  cell('rooms'),
  cell('area_sqm'),
  cell('floor'),
  cell('elevator'),
  cell('property_tax'),
  cell('building_fee'),
];

const LEAD = ['area_sqm', 'property_tax', 'building_fee'];

describe('a resident sees the schema order', () => {
  it('changes nothing', () => {
    assert.deepEqual(keys(orderForAudience(grid, 'resident', LEAD)), keys(grid));
  });

  it('returns a copy, not the original array', () => {
    // The caller renders this; handing back the input invites a sort in place
    // that reorders somebody else's data.
    const result = orderForAudience(grid, 'resident', LEAD);
    assert.notEqual(result, grid);
  });
});

describe('an investor leads with the numbers they compare', () => {
  it('promotes the lead keys in the SCHEMA order', () => {
    // Not the order they happen to sit in the grid — the schema's order is the
    // priority being expressed.
    assert.deepEqual(keys(orderForAudience(grid, 'investor', LEAD)).slice(0, 3), [
      'area_sqm',
      'property_tax',
      'building_fee',
    ]);
  });

  it('keeps everything else, in its original order, behind them', () => {
    assert.deepEqual(keys(orderForAudience(grid, 'investor', LEAD)), [
      'area_sqm',
      'property_tax',
      'building_fee',
      'rooms',
      'floor',
      'elevator',
    ]);
  });

  it('loses nothing and duplicates nothing', () => {
    const result = orderForAudience(grid, 'investor', LEAD);

    assert.equal(result.length, grid.length);
    assert.equal(new Set(keys(result)).size, grid.length);
  });

  it('skips a lead key the seller never answered', () => {
    // value:null facts never reach the grid, so a promoted key can simply be
    // absent. The grid reflows; it must not gap.
    const sparse = [cell('rooms'), cell('area_sqm'), cell('floor')];

    assert.deepEqual(keys(orderForAudience(sparse, 'investor', LEAD)), [
      'area_sqm',
      'rooms',
      'floor',
    ]);
  });
});

describe('a category with no investor ordering', () => {
  it('is unchanged for either audience', () => {
    // The vehicle schema declares none — a car has no price per m² and
    // inventing an investor ordering for one would be noise.
    for (const audience of ['resident', 'investor'] as const) {
      assert.deepEqual(keys(orderForAudience(grid, audience, undefined)), keys(grid));
      assert.deepEqual(keys(orderForAudience(grid, audience, [])), keys(grid));
    }
  });
});
