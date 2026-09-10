import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isProfileComplete,
  isProfileEmpty,
  normalisePhone,
  PROFILE_BLOCKER_CODES,
  profileBlockers,
  toSeller,
} from './profile.js';

describe('normalisePhone', () => {
  it('accepts the formats an Israeli agent actually types', () => {
    // Same mobile, eight ways. Every one of these appears on a business card
    // somewhere, and wa.me accepts exactly one of them.
    for (const input of [
      '050-123-4567',
      '0501234567',
      '050 123 4567',
      '+972-50-123-4567',
      '+972 50 1234567',
      '972501234567',
      '00972501234567',
      '(050) 123-4567',
    ]) {
      assert.equal(normalisePhone(input), '972501234567', input);
    }
  });

  it('handles the country code typed with the trunk zero left in', () => {
    // +972 050 … — what people write when they add the prefix without
    // knowing the zero has to go. Common enough to fix rather than reject.
    assert.equal(normalisePhone('+972-050-123-4567'), '972501234567');
  });

  it('strips the maqaf, which is what a Hebrew keyboard produces', () => {
    // U+05BE, not the ASCII hyphen. Typing a phone number in Hebrew layout
    // gives this, and a naive replace(/-/g) leaves it in place.
    assert.equal(normalisePhone('050־123־4567'), '972501234567');
  });

  it('accepts a landline, which is eight digits and not nine', () => {
    assert.equal(normalisePhone('03-1234567'), '97231234567');
    assert.equal(normalisePhone('+972 9 8765432'), '97298765432');
  });

  it('refuses rather than guessing', () => {
    for (const input of [
      '',
      '   ',
      'לא ידוע',
      '050-123',        // too short: a digit was dropped
      '050-123-45678',  // too long: a digit was doubled
      '1-800-123-456',  // a service number, never a person
      '+1 415 555 0100' // not Israeli, and this page dials Israel
    ]) {
      assert.equal(normalisePhone(input), undefined, JSON.stringify(input));
    }
  });

  it('refuses null and undefined without throwing', () => {
    // Both arrive straight from a Postgres nullable column.
    assert.equal(normalisePhone(null), undefined);
    assert.equal(normalisePhone(undefined), undefined);
  });
});

describe('profileBlockers', () => {
  it('is empty for a profile that can brand a listing', () => {
    assert.deepEqual(
      profileBlockers({ displayName: 'ליאור', phone: '050-123-4567' }),
      [],
    );
  });

  it('does NOT require an agency name', () => {
    // PRD §1 keeps the private seller a supported case. Requiring this would
    // make the product agent-only rather than agent-first.
    const profile = { displayName: 'ליאור', phone: '0501234567' };
    assert.equal(isProfileComplete(profile), true);
  });

  it('separates a missing phone from an undiallable one', () => {
    // Different sentences, different fixes — so different codes.
    assert.deepEqual(profileBlockers({ displayName: 'ליאור' }), ['phoneMissing']);
    assert.deepEqual(
      profileBlockers({ displayName: 'ליאור', phone: '050-123' }),
      ['phoneInvalid'],
    );
  });

  it('reports every blocker at once, not the first', () => {
    // Being told one thing, fixing it, and being told another is how a form
    // on a phone gets abandoned.
    const found = profileBlockers({});
    assert.deepEqual(found.sort(), ['nameMissing', 'phoneMissing'].sort());
  });

  it('treats whitespace as absent', () => {
    assert.deepEqual(profileBlockers({ displayName: '   ', phone: '  ' }).sort(), [
      'nameMissing',
      'phoneMissing',
    ]);
  });

  it('only ever returns codes that exist', () => {
    // The Hebrew lives in locales/he.json; a code with no copy renders as the
    // key to a seller mid-form.
    for (const code of profileBlockers({ displayName: '', phone: 'x' })) {
      assert.ok(PROFILE_BLOCKER_CODES.includes(code), code);
    }
  });
});

describe('isProfileEmpty', () => {
  it('is true for a row that exists but was never filled in', () => {
    // What the signup trigger creates: an id and nothing else.
    assert.equal(isProfileEmpty({}), true);
    assert.equal(
      isProfileEmpty({ displayName: null, phone: null, agencyName: null }),
      true,
    );
  });

  it('is false as soon as anything is answered', () => {
    assert.equal(isProfileEmpty({ agencyName: 'רוזן נדל״ן' }), false);
  });

  it('is not the same question as isProfileComplete', () => {
    // A half-filled profile is neither empty nor complete, and the first-run
    // prompt and the publish gate must not share one boolean.
    const half = { agencyName: 'רוזן נדל״ן' };
    assert.equal(isProfileEmpty(half), false);
    assert.equal(isProfileComplete(half), false);
  });
});

describe('toSeller', () => {
  it('normalises the phone on the way onto the listing', () => {
    const seller = toSeller(
      { displayName: 'ליאור', phone: '050-123-4567' },
      'בעל הדירה',
    );
    // CtaDock builds wa.me/<this> — digits, no plus.
    assert.equal(seller?.phone, '972501234567');
  });

  it('falls back to the category role when none was set', () => {
    const seller = toSeller({ displayName: 'ליאור', phone: '0501234567' }, 'בעל הרכב');
    assert.equal(seller?.role, 'בעל הרכב');
  });

  it('prefers the agent’s own role line', () => {
    const seller = toSeller(
      { displayName: 'ליאור', phone: '0501234567', role: 'מתווך מורשה' },
      'בעל הדירה',
    );
    assert.equal(seller?.role, 'מתווך מורשה');
  });

  it('OMITS the agency rather than setting it empty', () => {
    // Seller.agencyName being absent is what makes the agent bar fall back to
    // נבנה בסיבוב. An empty string is truthy in enough places to produce an
    // agency bar with no agency in it.
    const seller = toSeller(
      { displayName: 'ליאור', phone: '0501234567', agencyName: '  ' },
      'בעל הדירה',
    );
    assert.ok(seller);
    assert.equal('agencyName' in seller, false);
  });

  it('NEVER copies the licence number onto the page', () => {
    // Self-declared and unchecked (0009). Putting it beside verified register
    // data would borrow the facts grid's credibility for an unvalidated
    // string. This is the assertion that stops that happening by accident.
    const seller = toSeller(
      { displayName: 'ליאור', phone: '0501234567', licenceNumber: '7778889' },
      'בעל הדירה',
    );
    assert.ok(seller);
    assert.equal('licenceNumber' in seller, false);
    // The value, not just the key: a future field that happened to carry it
    // would pass the check above. The licence shares no digit run with the
    // normalised phone, so this cannot succeed by coincidence.
    assert.equal(JSON.stringify(seller).includes('7778889'), false);
  });

  it('returns undefined rather than a half-filled seller', () => {
    // A caller that skipped profileBlockers must not be able to stamp a page
    // with a phone that does not dial.
    assert.equal(toSeller({ displayName: 'ליאור' }, 'בעל הדירה'), undefined);
    assert.equal(toSeller({ phone: '0501234567' }, 'בעל הדירה'), undefined);
    assert.equal(toSeller({ displayName: 'ליאור', phone: '050' }, 'בעל הדירה'), undefined);
  });
});
