import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GAUGE_FULL_KM, gaugeFraction, odometerDigits, plateName } from './stage-signs.js';

describe('plateName', () => {
  it('puts רחוב before a bare street name', () => {
    assert.equal(plateName('דיזנגוף', 'תל אביב־יפו'), 'רחוב דיזנגוף');
  });

  it('never doubles a street type the name already has', () => {
    assert.equal(plateName('שדרות רוטשילד', 'תל אביב־יפו'), 'שדרות רוטשילד');
    assert.equal(plateName('רחוב הרצל', 'חולון'), 'רחוב הרצל');
    assert.equal(plateName('דרך מנחם בגין', 'תל אביב־יפו'), 'דרך מנחם בגין');
  });

  it('carries the city when the seller hid the street', () => {
    assert.equal(plateName(undefined, 'חולון'), 'חולון');
    assert.equal(plateName('   ', 'חולון'), 'חולון');
  });
});

describe('gaugeFraction', () => {
  it('scales and caps', () => {
    assert.equal(gaugeFraction(150_000, GAUGE_FULL_KM), 0.5);
    assert.equal(gaugeFraction(900_000, GAUGE_FULL_KM), 1);
  });

  it('reads unknown as empty, never as full', () => {
    assert.equal(gaugeFraction(null, GAUGE_FULL_KM), 0);
    assert.equal(gaugeFraction(-5, GAUGE_FULL_KM), 0);
    assert.equal(gaugeFraction(Number.NaN, GAUGE_FULL_KM), 0);
  });
});

describe('odometerDigits', () => {
  it('pads to six wheels', () => {
    assert.deepEqual(odometerDigits(128_000), [1, 2, 8, 0, 0, 0]);
    assert.deepEqual(odometerDigits(4_500), [0, 0, 4, 5, 0, 0]);
  });

  it('has no wheels for an unknown number', () => {
    assert.deepEqual(odometerDigits(undefined), []);
    assert.deepEqual(odometerDigits(-1), []);
  });
});
