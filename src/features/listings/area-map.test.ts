import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AreaPlaces } from '../../types/listing.js';
import { areaMap, hasWalkTimes } from './area-map.js';

const at = (name: string, lat: number, lon: number, walkMinutes?: number) => ({
  name,
  lat,
  lon,
  ...(walkMinutes === undefined ? {} : { walkMinutes }),
});

/** Real coordinates from Sokolov, Holon, so the projection is exercised. */
const HOLON: AreaPlaces = {
  city: 'חולון',
  street: 'סוקולוב',
  origin: { lat: 32.0227, lon: 34.7779 },
  neighbourhoods: [at('שכונת עם', 32.0231, 34.7785)],
  schools: [at('גן איל', 32.0206, 34.7772, 6), at('רביבים', 32.0259, 34.7801, 10)],
  transit: [at('חנקין/סוקולוב', 32.0232, 34.7776, 2)],
  parks: [at('גינת הפלמ״ח', 32.0219, 34.7763, 4)],
  community: [at('ספריית בן יהודה', 32.0234, 34.7791, 3)],
  shops: [at('פיטרו', 32.0224, 34.7787, 2)],
};

describe('areaMap', () => {
  it('puts the flat on the tiles and everything else where it is', () => {
    const map = areaMap(HOLON);
    assert.ok(map);

    assert.ok(map.cols >= 1 && map.rows >= 1);
    assert.ok(map.origin.x >= 0 && map.origin.x <= map.width);
    assert.ok(map.origin.y >= 0 && map.origin.y <= map.height);

    // גן איל is south and west of the flat, so below it and — since this is a
    // map and not a layout — to the LEFT of it, in Hebrew as in English.
    const school = map.pins.find((pin) => pin.name === 'גן איל');
    assert.ok(school);
    assert.ok(school.y > map.origin.y, 'south is down');
    assert.ok(school.x < map.origin.x, 'west is left, and a map does not mirror');

    // רביבים is north and east.
    const far = map.pins.find((pin) => pin.name === 'רביבים');
    assert.ok(far && far.y < map.origin.y && far.x > map.origin.x);
  });

  it('keeps distances proportional in both directions', () => {
    // One scale for both axes, or two places equally far from the flat would
    // look unequally far.
    const map = areaMap({
      ...HOLON,
      schools: [at('צפון', 32.0245, 34.7779), at('מזרח', 32.0227, 34.7798)],
      transit: [],
      parks: [],
      community: [],
      shops: [],
      neighbourhoods: [],
    });
    assert.ok(map);

    const north = map.pins.find((p) => p.name === 'צפון');
    const east = map.pins.find((p) => p.name === 'מזרח');
    assert.ok(north && east);

    const up = map.origin.y - north.y;
    const across = east.x - map.origin.x;
    // 0.0018 degrees of latitude and 0.0019 of longitude at this latitude are
    // within a few per cent of each other on the ground.
    assert.ok(Math.abs(up - across) / up < 0.15, `${up} vs ${across}`);
  });

  it('keeps every pin inside the frame', () => {
    // A pin outside the viewBox is a dashed line going off the edge to
    // nothing, which is what fitting the scale to the width alone produced
    // whenever the places were spread more north-to-south than east-to-west.
    const map = areaMap({
      ...HOLON,
      schools: [at('רחוק צפונה', 32.0310, 34.7780), at('רחוק דרומה', 32.0140, 34.7781)],
    });
    assert.ok(map);

    for (const pin of map.pins) {
      assert.ok(pin.x >= 0 && pin.x <= map.width, `x ${pin.x} of ${map.width}`);
      assert.ok(pin.y >= 0 && pin.y <= map.height, `y ${pin.y} of ${map.height}`);
    }
  });

  it('covers the drawing with street tiles rather than a blank frame', () => {
    const tight = areaMap({
      ...HOLON,
      schools: [at('קרוב', 32.0229, 34.7781)],
      transit: [],
      parks: [],
      community: [],
      shops: [],
      neighbourhoods: [],
    });
    assert.ok(tight);
    assert.equal(tight.width, tight.cols * 256);
    assert.equal(tight.height, tight.rows * 256);
    assert.ok(tight.height <= 1024, 'a phone should not get a map and nothing else');
  });

  it('keys the pins with Hebrew letters, never digits', () => {
    const map = areaMap(HOLON);
    assert.ok(map);

    // A digit here would be a number outside <bdi> in the built page, which
    // §4.2 forbids and the build gate rejects.
    for (const pin of map.pins) {
      assert.match(pin.key, /^[\u05D0-\u05EA]$/);
    }
  });

  it('spreads across the groups before taking a second from any', () => {
    // Eight pins should describe a neighbourhood, not eight bus stops.
    const map = areaMap({
      ...HOLON,
      transit: Array.from({ length: 6 }, (_, i) => at(`תחנה ${i}`, 32.0227 + i / 5000, 34.7779)),
    });
    assert.ok(map);

    const stops = map.pins.filter((pin) => pin.group === 'transit');
    assert.ok(stops.length <= 3, `${stops.length} stops out of ${map.pins.length}`);
  });

  it('draws nothing without an origin, and nothing with no places', () => {
    const { origin: _origin, ...noOrigin } = HOLON;
    assert.equal(areaMap(noOrigin), undefined);

    assert.equal(
      areaMap({
        city: 'חולון',
        origin: { lat: 32.0227, lon: 34.7779 },
        neighbourhoods: [],
        schools: [],
        transit: [],
        parks: [],
        community: [],
        shops: [],
      }),
      undefined,
    );
  });

  it('carries a routed time when there is one and nothing when there is not', () => {
    const map = areaMap(HOLON);
    assert.equal(map?.pins.find((p) => p.name === 'חנקין/סוקולוב')?.walkMinutes, 2);
    assert.equal(map?.pins.find((p) => p.name === 'שכונת עם')?.walkMinutes, undefined);
  });
});

describe('hasWalkTimes', () => {
  it('knows whether a router ever answered for this listing', () => {
    assert.equal(hasWalkTimes(HOLON), true);
    assert.equal(
      hasWalkTimes({ ...HOLON, schools: [], transit: [], parks: [], community: [], shops: [] }),
      false,
    );
  });
});
