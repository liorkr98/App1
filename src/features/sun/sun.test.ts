import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
