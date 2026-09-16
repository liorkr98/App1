import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cityPattern,
  groupFor,
  nameFor,
  placesFromOsm,
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

describe('placesFromOsm', () => {
  const where = { city: 'חולון', street: 'סוקולוב' };

  it('groups, names and de-duplicates', () => {
    const places = placesFromOsm(
      [
        { tags: { amenity: 'school', 'name:he': 'אורט חולון' } },
        // The same school as a building polygon as well as a node.
        { tags: { amenity: 'school', 'name:he': 'אורט חולון' } },
        { tags: { highway: 'bus_stop', name: 'סוקולוב/שדרות קוגל' } },
        // The other direction of the same stop.
        { tags: { highway: 'bus_stop', name: 'סוקולוב/שדרות קוגל' } },
        { tags: { leisure: 'park', name: 'גן הרצל' } },
        { tags: { amenity: 'bench' } },
        { tags: { leisure: 'park' } },
      ],
      where,
    );

    assert.deepEqual(places.schools, ['אורט חולון']);
    assert.deepEqual(places.transit, ['סוקולוב/שדרות קוגל']);
    assert.deepEqual(places.parks, ['גן הרצל']);
    assert.equal(places.city, 'חולון');
    assert.equal(places.street, 'סוקולוב');
  });

  it('does not report the city as its own neighbourhood', () => {
    const places = placesFromOsm(
      [
        { tags: { place: 'city', 'name:he': 'חולון' } },
        { tags: { place: 'suburb', 'name:he': 'רסקו א׳' } },
      ],
      where,
    );

    assert.deepEqual(places.neighbourhoods, ['רסקו א׳']);
  });

  it('caps each group, because one street can sit near forty stops', () => {
    const stops = Array.from({ length: 40 }, (_, i) => ({
      tags: { highway: 'bus_stop', name: `תחנה ${String.fromCharCode(1488 + (i % 22))}${i}` },
    }));

    assert.equal(placesFromOsm(stops, where).transit.length, 6);
  });

  it('omits the street when the seller withheld it', () => {
    const places = placesFromOsm([{ tags: { leisure: 'park', name: 'גן הרצל' } }], {
      city: 'חולון',
    });

    assert.equal(places.street, undefined);
  });
});
