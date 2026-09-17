import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cityPattern,
  groupFor,
  nameFor,
  placesFromOsm,
  pointOf,
  streetPattern,
  withoutHouseNumber,
  withoutStreetPrefix,
} from './osm-area.js';

/**
 * The patterns are checked by APPLYING them, with JavaScript's own regex, to
 * the exact strings OpenStreetMap holds. Those strings were read off the live
 * API — `תל־אביב–יפו` really does carry a maqaf and an en dash — because the
 * whole failure this guards against was a pattern that looked right.
 *
 * Overpass compiles them with POSIX regex, which is stricter: no `\s`, no
 * non-capturing groups. Anything that passes here and uses neither is safe
 * there, and `verifyPosix` below is the reminder.
 */
const matches = (pattern: string, name: string) => new RegExp(pattern).test(name);

describe('pattern dialect', () => {
  it('uses nothing POSIX regex lacks', () => {
    const patterns = [
      cityPattern('תל אביב'),
      streetPattern("שד' ירושלים 5") ?? '',
      streetPattern('חיים עוזר') ?? '',
    ];

    for (const pattern of patterns) {
      // `\s` matches a literal backslash under POSIX, which is how every
      // multi-word name silently matched nothing.
      assert.equal(pattern.includes('\\s'), false, pattern);
      assert.equal(pattern.includes('(?:'), false, pattern);
    }
  });
});

describe('cityPattern', () => {
  it('matches the punctuation OSM uses and nobody types', () => {
    // Read from the live API: name="תל־אביב–יפו", maqaf then en dash.
    assert.equal(matches(cityPattern('תל אביב'), 'תל־אביב–יפו'), true);
    assert.equal(matches(cityPattern('רמת גן'), 'רמת גן'), true);
    assert.equal(matches(cityPattern('באר שבע'), 'באר־שבע'), true);
  });

  it('is anchored at the start so one city is not another', () => {
    assert.equal(matches(cityPattern('גן'), 'רמת גן'), false);
  });
});

describe('street normalisation', () => {
  it('drops the house number, with or without a letter', () => {
    assert.equal(withoutHouseNumber('סוקולוב 12'), 'סוקולוב');
    assert.equal(withoutHouseNumber('הרצל 5א'), 'הרצל');
    assert.equal(withoutHouseNumber('הרצל'), 'הרצל');
  });

  it('drops the street-type prefix, abbreviated or not', () => {
    assert.equal(withoutStreetPrefix("שד' ירושלים 5"), 'ירושלים');
    assert.equal(withoutStreetPrefix('שדרות ירושלים'), 'ירושלים');
    assert.equal(withoutStreetPrefix('רחוב חיים עוזר 8'), 'חיים עוזר');
    // Not a prefix inside a name: שדרות must not eat שד from שדה.
    assert.equal(withoutStreetPrefix('שדה בוקר 3'), 'שדה בוקר');
  });
});

describe('streetPattern', () => {
  it('matches the name as OSM writes it, prefix and all', () => {
    const pattern = streetPattern("שד' ירושלים 5") ?? '';

    assert.equal(matches(pattern, 'ירושלים'), true);
    assert.equal(matches(pattern, 'שדרות ירושלים'), true);
  });

  it('matches when OSM carries a middle name the seller omits', () => {
    // Be'er Sheva: OSM has שדרות יצחק רגר and an agent writes רגר. No list of
    // prefixes reaches a word in the middle; a suffix match does.
    const pattern = streetPattern('רגר 40') ?? '';

    assert.equal(matches(pattern, 'שדרות יצחק רגר'), true);
    assert.equal(matches(pattern, 'רגר'), true);
  });

  it('matches across a maqaf where the seller typed a space', () => {
    const pattern = streetPattern('בן גוריון 1') ?? '';

    assert.equal(matches(pattern, 'בן־גוריון'), true);
    assert.equal(matches(pattern, 'שדרות בן גוריון'), true);
  });

  it('will not match a different street that merely contains the name', () => {
    const pattern = streetPattern('הרצל 5') ?? '';

    // Neighbours from the wrong street would be stated about this address by
    // name, which is worse than writing no paragraph at all.
    assert.equal(matches(pattern, 'הרצל הצעיר'), false);
    assert.equal(matches(pattern, 'בן הרצל ושותפיו'), false);
  });

  it('refuses a street with nothing to match on', () => {
    assert.equal(streetPattern('12'), undefined);
    assert.equal(streetPattern('רחוב'), undefined);
    assert.equal(streetPattern(''), undefined);
  });
});

describe('groupFor', () => {
  it('puts each tag in the group the paragraph talks about', () => {
    assert.equal(groupFor({ amenity: 'school' }), 'school');
    assert.equal(groupFor({ amenity: 'kindergarten' }), 'school');
    assert.equal(groupFor({ highway: 'bus_stop' }), 'transit');
    assert.equal(groupFor({ railway: 'tram_stop' }), 'transit');
    assert.equal(groupFor({ leisure: 'park' }), 'park');
    assert.equal(groupFor({ amenity: 'community_centre' }), 'community');
    assert.equal(groupFor({ leisure: 'swimming_pool' }), 'community');
    assert.equal(groupFor({ shop: 'supermarket' }), 'shop');
    assert.equal(groupFor({ amenity: 'pharmacy' }), 'shop');
    assert.equal(groupFor({ place: 'neighbourhood' }), 'neighbourhood');
  });

  it('takes the first rule when a feature carries several tags', () => {
    // A school with a library in it is a school.
    assert.equal(groupFor({ amenity: 'school', leisure: 'park' }), 'school');
  });

  it('ignores everything we do not write sentences about', () => {
    assert.equal(groupFor({ amenity: 'bench' }), undefined);
    assert.equal(groupFor({ power: 'tower' }), undefined);
    assert.equal(groupFor({}), undefined);
  });
});

describe('nameFor', () => {
  it('prefers the Hebrew name', () => {
    assert.equal(nameFor({ 'name:he': 'אורט חולון', name: 'ORT Holon' }), 'אורט חולון');
  });

  it('drops a Latin-only name rather than transliterating it', () => {
    // OSM's plain `name` in Israel is often the transliteration, and "Tavas
    // Kindergarten" among Hebrew names reads as broken.
    assert.equal(nameFor({ name: 'Tavas Kindergarten' }), undefined);
  });

  it('drops an unnamed feature — "a park" is a placeholder', () => {
    assert.equal(nameFor({}), undefined);
    assert.equal(nameFor({ name: '   ' }), undefined);
  });
});

describe('pointOf', () => {
  it('reads a node\u2019s own position and a way\u2019s centre', () => {
    // A bus stop is a node; a school is usually a polygon, and `out center`
    // is why the second form exists at all.
    assert.deepEqual(pointOf({ lat: 32.0157, lon: 34.7789 }), {
      lat: 32.0157,
      lon: 34.7789,
    });
    assert.deepEqual(pointOf({ center: { lat: 32.0148, lon: 34.7812 } }), {
      lat: 32.0148,
      lon: 34.7812,
    });
    assert.equal(pointOf({}), undefined);
  });
});

describe('placesFromOsm', () => {
  const where = { city: 'חולון', street: 'סוקולוב' };
  const node = (tags: Record<string, string>, lat = 32.015, lon = 34.779) => ({
    tags,
    lat,
    lon,
  });

  it('groups, names and de-duplicates', () => {
    const places = placesFromOsm(
      [
        node({ amenity: 'school', 'name:he': 'אורט חולון' }, 32.0148, 34.7812),
        // The same school as a building polygon as well as a node.
        { tags: { amenity: 'school', 'name:he': 'אורט חולון' }, center: { lat: 32.0148, lon: 34.7812 } },
        node({ highway: 'bus_stop', name: 'סוקולוב/שדרות קוגל' }, 32.0157, 34.7789),
        // The other direction of the same stop.
        node({ highway: 'bus_stop', name: 'סוקולוב/שדרות קוגל' }, 32.0158, 34.779),
        node({ leisure: 'park', name: 'גן הרצל' }, 32.0143, 34.7776),
        node({ amenity: 'bench' }),
        node({ leisure: 'park' }),
      ],
      where,
    );

    assert.deepEqual(
      places.schools.map((p) => p.name),
      ['אורט חולון'],
    );
    assert.deepEqual(
      places.transit.map((p) => p.name),
      ['סוקולוב/שדרות קוגל'],
    );
    assert.deepEqual(places.parks[0], { name: 'גן הרצל', lat: 32.0143, lon: 34.7776 });
    assert.equal(places.city, 'חולון');
    assert.equal(places.street, 'סוקולוב');
  });

  it('skips a place OSM gave no position for', () => {
    // No coordinate means no map pin and nothing to route to.
    const places = placesFromOsm([{ tags: { leisure: 'park', name: 'גן הרצל' } }], where);
    assert.deepEqual(places.parks, []);
  });

  it('takes the matched road as the origin, and does not list it as a place', () => {
    const places = placesFromOsm(
      [
        node({ highway: 'residential', name: 'סוקולוב' }, 32.014, 34.778),
        node({ highway: 'residential', name: 'סוקולוב' }, 32.016, 34.78),
        node({ leisure: 'park', name: 'גן הרצל' }, 32.0143, 34.7776),
      ],
      where,
    );

    // The middle of the road, which is what walking times are measured from.
    // Compared with a tolerance because it is a mean of floats.
    assert.ok(Math.abs((places.origin?.lat ?? 0) - 32.015) < 1e-9);
    assert.ok(Math.abs((places.origin?.lon ?? 0) - 34.779) < 1e-9);
    assert.equal(places.parks.length, 1);
  });

  it('never invents a walking time from the coordinates it holds', () => {
    // The one rule this whole module exists under: distance orders candidates
    // and draws the map, and a walking time comes from a router or not at all.
    const places = placesFromOsm(
      [node({ leisure: 'park', name: 'גן הרצל' }, 32.0143, 34.7776)],
      where,
    );

    assert.equal(places.parks[0]?.walkMinutes, undefined);
  });

  it('does not report the city as its own neighbourhood', () => {
    const places = placesFromOsm(
      [
        node({ place: 'city', 'name:he': 'חולון' }),
        node({ place: 'suburb', 'name:he': 'רסקו א׳' }),
      ],
      where,
    );

    assert.deepEqual(
      places.neighbourhoods.map((p) => p.name),
      ['רסקו א׳'],
    );
  });

  it('keeps the SIX NEAREST when a street sits near forty stops', () => {
    const stops = Array.from({ length: 40 }, (_, i) =>
      node(
        { highway: 'bus_stop', name: `תחנה ${i}` },
        // Increasingly far from the origin below.
        32.015 + i / 2000,
        34.779,
      ),
    );

    const places = placesFromOsm(
      [node({ highway: 'residential', name: 'סוקולוב' }, 32.015, 34.779), ...stops],
      where,
    );

    assert.equal(places.transit.length, 6);
    assert.deepEqual(
      places.transit.map((p) => p.name),
      ['תחנה 0', 'תחנה 1', 'תחנה 2', 'תחנה 3', 'תחנה 4', 'תחנה 5'],
    );
  });

  it('omits the street when the seller withheld it', () => {
    const places = placesFromOsm([node({ leisure: 'park', name: 'גן הרצל' })], {
      city: 'חולון',
    });

    assert.equal(places.street, undefined);
  });
});
