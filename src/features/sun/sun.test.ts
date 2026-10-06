import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coarseOrigin, coarseSunPoint, ISRAEL_CENTRE, sunAnchor } from './anchor.js';
import { ASPECT_BEARING, bearingGap, facadeSunMinutes, seasonMoment, sunPosition } from './sun.js';

// Dizengoff, Tel Aviv.
const LAT = 32.0808;
const LNG = 34.7741;

const noonOf = (season: 'summer' | 'winter') => {
  // Find the highest point of the day, to the minute.
  let best = { hour: 0, altitude: -90, bearing: 0 };
  for (let hour = 10; hour <= 14; hour += 1 / 60) {
    const sun = sunPosition(seasonMoment(season, hour), LAT, LNG);
    if (sun.altitude > best.altitude) best = { hour, ...sun };
  }
  return best;
};

describe('sun position', () => {
  it('stands about 81° over Tel Aviv at midsummer noon, due south', () => {
    const noon = noonOf('summer');
    // 90 − 32.08 + 23.44 = 81.36
    assert.ok(Math.abs(noon.altitude - 81.4) < 0.6, `altitude ${noon.altitude}`);
    assert.ok(bearingGap(noon.bearing, 180) < 3, `bearing ${noon.bearing}`);
    // Solar noon at 34.77°E, summer time, is about 12:40 on a wall clock.
    assert.ok(Math.abs(noon.hour - 12.67) < 0.2, `solar noon at ${noon.hour}`);
  });

  it('stands about 34.5° at midwinter noon', () => {
    const noon = noonOf('winter');
    // 90 − 32.08 − 23.44 = 34.48
    assert.ok(Math.abs(noon.altitude - 34.5) < 0.6, `altitude ${noon.altitude}`);
  });

  it('is below the horizon at midnight and rises in the east-north-east in June', () => {
    assert.ok(sunPosition(seasonMoment('summer', 0), LAT, LNG).altitude < -20);
    const morning = sunPosition(seasonMoment('summer', 6.5), LAT, LNG);
    assert.ok(morning.altitude > 0 && morning.bearing > 60 && morning.bearing < 100, JSON.stringify(morning));
  });

  it('gives a south facade more winter sun than a north one', () => {
    const south = facadeSunMinutes('winter', LAT, LNG, ASPECT_BEARING['דרום']!);
    const north = facadeSunMinutes('winter', LAT, LNG, ASPECT_BEARING['צפון']!);
    assert.ok(south > 8 * 60, `south ${south}`);
    assert.equal(north, 0);
  });

  it('knows every aspect the property schema offers', () => {
    for (const aspect of ['צפון', 'דרום', 'מזרח', 'מערב', 'צפון־מזרח', 'צפון־מערב', 'דרום־מזרח', 'דרום־מערב']) {
      assert.ok(aspect in ASPECT_BEARING, aspect);
    }
  });

  it('measures the gap between bearings across north', () => {
    assert.equal(bearingGap(350, 10), 20);
    assert.equal(bearingGap(90, 270), 180);
  });
});

const aspect = (value: string) => ({ key: 'aspect', value, present: true });

describe('sun anchor', () => {
  it('rounds a pin to 0.1° and keeps a street exact', () => {
    const anchor = sunAnchor({
      facts: [aspect('דרום')],
      location: { street: 'דיזנגוף', lat: 32.0808, lng: 34.7741 },
    });
    assert.deepEqual(anchor, { lat: 32.1, lng: 34.8, facing: 180, approx: false });
  });

  it('uses the street midpoint when the listing has no pin', () => {
    const anchor = sunAnchor({
      facts: [aspect('צפון־מזרח')],
      location: { street: 'סוקולוב' },
      origin: { lat: 32.0165, lon: 34.7792 },
    });
    assert.equal(anchor?.approx, true);
    assert.equal(anchor?.lat, 32);
    assert.equal(anchor?.lng, 34.8);
    assert.equal(anchor?.facing, 45);
  });

  it('still draws the day without an aspect, with no facade', () => {
    assert.deepEqual(sunAnchor({ facts: [], location: { street: 'דיזנגוף', lat: 32.1, lng: 34.8 } }), {
      lat: 32.1,
      lng: 34.8,
      facing: null,
      approx: false,
    });
    assert.equal(coarseSunPoint(51.5, -0.1), undefined);
  });

  it('falls back to the middle of Israel, approximate, when there is no point', () => {
    assert.deepEqual(sunAnchor({ facts: [aspect('דרום')], location: { street: 'סוקולוב' } }), {
      ...ISRAEL_CENTRE,
      facing: 180,
      approx: true,
    });
    assert.equal(coarseSunPoint(51.5, -0.1), undefined);
    assert.deepEqual(coarseOrigin({ origin: { lat: 32.016, lon: 34.779 } }), { lat: 32, lng: 34.8 });
  });
});
