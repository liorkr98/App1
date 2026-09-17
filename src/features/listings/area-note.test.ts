import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acceptAreaNote,
  allowedNames,
  areaNoteFromPlaces,
  buildAreaPrompt,
  hasPlaces,
  isGrounded,
  type AreaPlaces,
} from './area-note.js';

/**
 * The names are real ones, taken from what OpenStreetMap actually returns for
 * סוקולוב, חולון. A fixture of invented Hebrew names would not exercise the
 * thing these guards exist for.
 */
/**
 * Coordinates are real too — read off the same Overpass answer — because the
 * map and the routing both use them, and a fixture of round numbers would not
 * catch a projection that ignores latitude.
 */
const at = (
  name: string,
  lat: number,
  lon: number,
  walkMinutes?: number,
  mode?: 'bus' | 'rail',
) => ({
  name,
  lat,
  lon,
  ...(walkMinutes === undefined ? {} : { walkMinutes }),
  ...(mode ? { mode } : {}),
});

const HOLON: AreaPlaces = {
  city: 'חולון',
  street: 'סוקולוב',
  origin: { lat: 32.0154, lon: 34.7795 },
  neighbourhoods: [at('רסקו א׳', 32.0161, 34.7801), at('קריית עבודה', 32.0189, 34.7742)],
  schools: [
    at('אורט חולון', 32.0148, 34.7812),
    at('כצנלסון', 32.0171, 34.7768),
    at('גן גרנית', 32.0139, 34.7783),
  ],
  transit: [at('סוקולוב/שדרות קוגל', 32.0157, 34.7789), at('ויצמן/ההסתדרות', 32.0166, 34.7821)],
  parks: [at('גן הרצל', 32.0143, 34.7776), at('גן השומרון', 32.0182, 34.7809)],
  community: [at('מתנ״ס וולפסון', 32.0150, 34.7803), at('ספריית בן יהודה', 32.0174, 34.7791)],
  shops: [at('שופרסל אקספרס', 32.0146, 34.7797), at('מאפה ברכה', 32.0163, 34.7773)],
};

/** The same area once a router has answered. */
const HOLON_ROUTED: AreaPlaces = {
  ...HOLON,
  schools: [
    at('אורט חולון', 32.0148, 34.7812, 7),
    at('כצנלסון', 32.0171, 34.7768, 9),
    at('גן גרנית', 32.0139, 34.7783, 4),
  ],
  transit: [
    at('סוקולוב/שדרות קוגל', 32.0157, 34.7789, 2),
    at('ויצמן/ההסתדרות', 32.0166, 34.7821, 6),
  ],
};

const EMPTY: AreaPlaces = {
  city: 'חולון',
  neighbourhoods: [],
  schools: [],
  transit: [],
  parks: [],
  community: [],
  shops: [],
};

describe('hasPlaces', () => {
  it('is false when OSM knew nothing about the street', () => {
    assert.equal(hasPlaces(EMPTY), false);
    assert.equal(hasPlaces(HOLON), true);
  });
});

describe('buildAreaPrompt', () => {
  it('sends the closest stop, not a catalogue of every name', () => {
    const prompt = buildAreaPrompt(HOLON);

    assert.ok(prompt.includes('עיר: חולון'));
    assert.ok(prompt.includes('רחוב: סוקולוב'));
    assert.ok(prompt.includes('אורט חולון'));
    assert.ok(prompt.includes('מתנ״ס וולפסון'));
    // No radius, no distance, no walking time reaches the model — it cannot
    // write a number it was never given.
    assert.equal(/\d/.test(prompt), false);
  });

  it('caps each group so four lines do not become a list of forty', () => {
    const prompt = buildAreaPrompt({
      ...HOLON,
      transit: ['תחנה א', 'תחנה ב', 'תחנה ג', 'תחנה ד', 'תחנה ה', 'תחנה ו'].map((n, i) =>
        at(n, 32.015 + i / 1000, 34.779),
      ),
    });

    // The whole line, not a substring search: a single Hebrew letter appears
    // inside half the words on the page.
    assert.ok(prompt.includes('תחנת האוטובוס הקרובה — רק זו: תחנה א\n'));
    assert.equal(prompt.includes('תחנה ב'), false);
  });

  it('omits a group with nothing in it rather than saying it is empty', () => {
    const prompt = buildAreaPrompt({ ...HOLON, parks: [], community: [] });

    assert.equal(prompt.includes('פארקים'), false);
    assert.equal(prompt.includes('קהילה'), false);
  });
});

describe('isGrounded', () => {
  it('accepts a paragraph that names only what it was given', () => {
    assert.equal(
      isGrounded(
        'הדירה ברסקו א׳ בחולון. בסביבה בתי הספר אורט חולון וכצנלסון, וגן גרנית. ' +
          'תחנת סוקולוב/שדרות קוגל בקרבת מקום, וגם גן הרצל ומתנ״ס וולפסון.',
        HOLON,
      ),
      true,
    );
  });

  it('rejects any digit, because no number here can be sourced', () => {
    // No OSRM, so there is no routed walking time, and straight-line distance
    // is forbidden as a substitute (CLAUDE.md §2).
    assert.equal(
      isGrounded('הדירה ברסקו א׳. גן הרצל במרחק 5 דקות הליכה.', HOLON),
      false,
    );
  });

  it('rejects a school claim that names no real school', () => {
    assert.equal(
      isGrounded('הדירה ברסקו א׳ בחולון, ליד בתי ספר טובים ומבוקשים.', HOLON),
      false,
    );
  });

  it('rejects a transit claim that names no real stop', () => {
    assert.equal(isGrounded('יש תחנת אוטובוס קרובה מאוד לבית.', HOLON), false);
  });

  it('rejects a paragraph that drifts to another city', () => {
    // The most plausible-sounding way this goes wrong: a flat in Holon
    // described as being near Tel Aviv.
    assert.equal(
      isGrounded('הדירה ברסקו א׳ בחולון, קרוב מאוד לתל אביב.', HOLON),
      false,
    );
  });

  it('rejects a population claim, which nothing in the list supports', () => {
    assert.equal(isGrounded('שכונת רסקו א׳ היא שכונה עם תושבים ותיקים.', HOLON), false);
  });
});

describe('routed minutes', () => {
  it('states a routed time and allows exactly that number', () => {
    const prompt = buildAreaPrompt(HOLON_ROUTED);
    assert.ok(prompt.includes('אורט חולון (7 דקות הליכה)'));

    assert.equal(
      isGrounded('הדירה ברסקו א׳. אורט חולון 7 דקות הליכה מהבית.', HOLON_ROUTED),
      true,
    );
  });

  it('refuses a walking time the router did not give', () => {
    // The whole point: nine minutes is a real number for a different place,
    // and three is nobody's answer. Neither may be said about אורט חולון.
    assert.equal(
      isGrounded('אורט חולון 3 דקות הליכה מהבית, ליד גן הרצל.', HOLON_ROUTED),
      false,
    );
  });

  it('allows no digit at all when no router answered', () => {
    assert.equal(isGrounded('אורט חולון 7 דקות הליכה מהבית.', HOLON), false);
  });

  it('writes the time into the plain paragraph when it has one', () => {
    const text = areaNoteFromPlaces(HOLON_ROUTED);
    assert.ok(text.includes('אורט חולון (7 דקות הליכה)'));
    assert.ok(text.includes('תחנת האוטובוס הקרובה היא סוקולוב/שדרות קוגל (2 דקות הליכה)'));
    assert.equal(isGrounded(text, HOLON_ROUTED), true);
  });
});

describe('acceptAreaNote', () => {
  it('tidies a reply and keeps it', () => {
    const accepted = acceptAreaNote(
      '  "הדירה ברסקו א׳ בחולון. בסביבה אורט חולון וגן גרנית, ומתנ״ס וולפסון."  ',
      HOLON,
    );

    assert.ok(accepted?.startsWith('הדירה ברסקו'));
    assert.equal(accepted?.includes('"'), false);
  });

  it('refuses a superlative and a valuation', () => {
    const base = 'הדירה ברסקו א׳ בחולון, ליד אורט חולון וגן הרצל';
    assert.equal(acceptAreaNote(`${base}, שכונה מדהימה.`, HOLON), undefined);
    assert.equal(acceptAreaNote(`${base}, עם פוטנציאל עליית ערך.`, HOLON), undefined);
  });

  it('refuses a page of prose — the brief was a few lines', () => {
    const long = `הדירה ברסקו א׳ בחולון. ${'בסביבה אורט חולון וגן הרצל. '.repeat(40)}`;
    assert.equal(acceptAreaNote(long, HOLON), undefined);
  });

  it('refuses English, and refuses a fragment', () => {
    assert.equal(acceptAreaNote('A quiet neighbourhood near good schools.', HOLON), undefined);
    assert.equal(acceptAreaNote('שכונה טובה.', HOLON), undefined);
  });
});

describe('areaNoteFromPlaces', () => {
  it('writes the same paragraph with no model, leading with the neighbourhood', () => {
    const text = areaNoteFromPlaces(HOLON);

    assert.ok(text.startsWith('הדירה בשכונת רסקו א׳ בחולון, ברחוב סוקולוב.'));
    assert.ok(text.includes('אורט חולון'));

    assert.ok(text.includes('גן הרצל'));
    assert.ok(text.includes('מתנ״ס וולפסון'));
    assert.ok(text.includes('תחנת האוטובוס הקרובה היא סוקולוב/שדרות קוגל'));
    assert.equal(text.includes('שופרסל אקספרס'), false);
    assert.equal(text.includes('גן השומרון'), false);
    assert.equal(text.includes('ספריית בן יהודה'), false);
    // It has to survive its own guard, or the fallback would be rejected by
    // the rule the model is held to.
    assert.equal(isGrounded(text, HOLON), true);
  });

  it('falls back to the city when OSM named no neighbourhood', () => {
    const text = areaNoteFromPlaces({ ...HOLON, neighbourhoods: [] });
    assert.ok(text.startsWith('הדירה בחולון, ברחוב סוקולוב.'));
  });

  it('names the closest bus and the closest rail as two different things', () => {
    const text = areaNoteFromPlaces({
      ...HOLON,
      transit: [
        at('סוקולוב/שדרות קוגל', 32.0157, 34.7789, 2, 'bus'),
        at('חולון וולפסון', 32.016, 34.781, 11, 'rail'),
      ],
    });

    assert.ok(text.includes('תחנת האוטובוס הקרובה היא סוקולוב/שדרות קוגל (2 דקות הליכה)'));
    assert.ok(text.includes('תחנת הרכבת הקרובה היא חולון וולפסון (11 דקות הליכה)'));
  });

  it('says only where it is when nothing else is known', () => {
    assert.equal(areaNoteFromPlaces(EMPTY), 'הדירה בחולון.');
  });
});

describe('allowedNames', () => {
  it('is every name the paragraph may use, and nothing else', () => {
    const names = allowedNames(HOLON);

    assert.ok(names.includes('חולון'));
    assert.ok(names.includes('סוקולוב'));
    assert.ok(names.includes('ספריית בן יהודה'));
    assert.equal(names.includes('תל אביב'), false);
  });
});
