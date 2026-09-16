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
const HOLON: AreaPlaces = {
  city: 'חולון',
  street: 'סוקולוב',
  neighbourhoods: ['רסקו א׳', 'קריית עבודה'],
  schools: ['אורט חולון', 'כצנלסון', 'גן גרנית'],
  transit: ['סוקולוב/שדרות קוגל', 'ויצמן/ההסתדרות'],
  parks: ['גן הרצל', 'גן השומרון'],
  community: ['מתנ״ס וולפסון', 'ספריית בן יהודה'],
  shops: ['שופרסל אקספרס', 'מאפה ברכה'],
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
  it('sends the address and the names, and no number of any kind', () => {
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
      transit: ['תחנה א', 'תחנה ב', 'תחנה ג', 'תחנה ד', 'תחנה ה', 'תחנה ו'],
    });

    // The whole line, not a substring search: a single Hebrew letter appears
    // inside half the words on the page.
    assert.ok(prompt.includes('תחבורה — בשם התחנה: תחנה א, תחנה ב, תחנה ג\n'));
    assert.equal(prompt.includes('תחנה ד'), false);
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
    const long = `הדירה ברסקו א׳ בחולון. ${'בסביבה אורט חולון וגן הרצל. '.repeat(20)}`;
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

    assert.ok(text.startsWith('הדירה ברסקו א׳, חולון.'));
    assert.ok(text.includes('אורט חולון'));

    // One park, one community place, one shop — Israeli place names run long
    // and five in a sentence is a list rather than a description.
    assert.ok(text.includes('גן הרצל'));
    assert.ok(text.includes('מתנ״ס וולפסון'));
    assert.ok(text.includes('שופרסל אקספרס'));
    assert.equal(text.includes('גן השומרון'), false);
    assert.equal(text.includes('ספריית בן יהודה'), false);
    assert.equal(text.includes('מאפה ברכה'), false);
    // It has to survive its own guard, or the fallback would be rejected by
    // the rule the model is held to.
    assert.equal(isGrounded(text, HOLON), true);
  });

  it('falls back to the city when OSM named no neighbourhood', () => {
    const text = areaNoteFromPlaces({ ...HOLON, neighbourhoods: [] });
    assert.ok(text.startsWith('הדירה בחולון.'));
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
