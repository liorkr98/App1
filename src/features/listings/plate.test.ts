import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { factsFromSchema } from '@/types/listing.js';
import { vehicleSchema } from './schemas/index.js';
import {
  attachLookup,
  formatPlateForInput,
  normalisePlate,
  OwnershipNotDeclared,
  toLookupValues,
  toMonthYear,
} from './plate.js';

const MOT = { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' };

describe('normalisePlate', () => {
  it('accepts the formats a seller actually types', () => {
    // Same plate, four ways. The register stores a bare number.
    for (const input of ['12-345-67', '12 345 67', '1234567', '12.345.67']) {
      assert.equal(normalisePlate(input), '1234567', input);
    }
  });

  it('accepts the eight-digit format used since 2017', () => {
    assert.equal(normalisePlate('123-45-678'), '12345678');
  });

  it('accepts a typographic dash, which phones substitute', () => {
    assert.equal(normalisePlate('12–345–67'), '1234567');
  });

  it('rejects anything that is not a plate', () => {
    // Undefined is an ordinary outcome — the editor just offers no lookup.
    // It is not an error to put in front of the seller.
    for (const input of ['', 'abc', '123456789', '1234', 'מספר רישוי']) {
      assert.equal(normalisePlate(input), undefined, input);
    }
  });
});

describe('formatPlateForInput', () => {
  it('groups seven and eight digit plates the way they are printed', () => {
    assert.equal(formatPlateForInput('1234567'), '12-345-67');
    assert.equal(formatPlateForInput('12345678'), '123-45-678');
  });

  it('leaves other lengths alone rather than inventing a grouping', () => {
    assert.equal(formatPlateForInput('12345'), '12345');
  });
});

describe('toMonthYear', () => {
  it('reduces a register date to month and year', () => {
    // A seller knows the month their טסט expires, not the day.
    assert.equal(toMonthYear('2027-03-14'), '03/2027');
    assert.equal(toMonthYear('14/03/2027'), '03/2027');
  });

  it('returns undefined rather than guessing at an unknown format', () => {
    assert.equal(toMonthYear('March 2027'), undefined);
    assert.equal(toMonthYear(''), undefined);
  });
});

describe('toLookupValues', () => {
  const registry = {
    tozeret_nm: 'מאזדה',
    kinuy_mishari: '3',
    degem_nm: 'BM',
    shnat_yitzur: 2021,
    sug_delek_nm: 'בנזין',
    tokef_dt: '2027-03-14',
    baalut: 'פרטית',
    degem_cd: 123,
  };

  it('maps the registry fields onto schema keys', () => {
    const values = toLookupValues({ registry });

    assert.equal(values.make, 'מאזדה');
    assert.equal(values.year, 2021);
    assert.equal(values.fuel, 'בנזין');
    assert.equal(values.previous_ownership, 'פרטית');
    assert.equal(values.test_until, '03/2027');
  });

  it('prefers the commercial name over the internal designation', () => {
    assert.equal(toLookupValues({ registry }).model, '3');
    assert.equal(
      toLookupValues({ registry: { ...registry, kinuy_mishari: '' } }).model,
      'BM',
    );
  });

  it('takes engine capacity from the MODEL CATALOGUE, not the registry', () => {
    // נפח מנוע is not in the registry at all — it needs a join on degem_cd
    // (docs/DATA-SOURCES.md finding 2). Without the catalogue row it must be
    // absent, not guessed.
    assert.equal(toLookupValues({ registry }).engine_cc, undefined);
    assert.equal(toLookupValues({ registry, model: { nefah_manoa: 1598 } }).engine_cc, 1598);
  });

  it('OMITS a field the registers did not supply', () => {
    // A plausible default wearing a מאומת badge is a fabricated fact, which
    // is the one thing §7 forbids outright.
    const values = toLookupValues({ registry: { tozeret_nm: 'מאזדה' } });

    assert.equal(values.make, 'מאזדה');
    assert.equal(values.year, undefined);
    assert.equal(values.fuel, undefined);
    assert.equal(values.test_until, undefined);
  });

  it('never returns the plate itself', () => {
    // The plate is a lookup key. It has no key to land in and no field on
    // Listing to reach — this asserts the first half of that.
    const values = toLookupValues({ registry, model: { nefah_manoa: 1598 }, ownershipCount: 2 });

    for (const value of Object.values(values)) {
      assert.notEqual(String(value), '1234567');
    }
    assert.ok(!('plate' in values));
    assert.ok(!('mispar_rechev' in values));
  });

  describe('יד, which is derived rather than read', () => {
    it('maps an ownership count onto the schema ordinals', () => {
      assert.equal(toLookupValues({ registry, ownershipCount: 1 }).hand, 'ראשונה');
      assert.equal(toLookupValues({ registry, ownershipCount: 3 }).hand, 'שלישית');
    });

    it('caps at the last ordinal the schema offers', () => {
      assert.equal(toLookupValues({ registry, ownershipCount: 9 }).hand, 'חמישית ומעלה');
    });

    it('leaves יד ABSENT when there is no count', () => {
      // The history register only covers 2017 onward, so a 2012 car has no
      // usable count. A confidently wrong יד on a page advertising itself as
      // verified is worse than none.
      assert.equal(toLookupValues({ registry }).hand, undefined);
      assert.equal(toLookupValues({ registry, ownershipCount: 0 }).hand, undefined);
    });
  });
});

describe('attachLookup — the ownership gate', () => {
  const facts = factsFromSchema(vehicleSchema);
  const values = { make: 'מאזדה', year: 2021 };

  it('REFUSES without the declaration', () => {
    // אני מצהיר שהרכב בבעלותי is the legal basis for the lookup, so it is a
    // required argument rather than a check somewhere else.
    assert.throws(() => attachLookup(facts, values, undefined, MOT), OwnershipNotDeclared);
  });

  it('records the declaration timestamp when it is given', () => {
    const at = '2026-09-09T10:00:00.000Z';
    const result = attachLookup(facts, values, at, MOT);

    assert.equal(result.declaration.declared, true);
    assert.equal(result.declaration.declaredAt, at);
  });

  it('marks filled facts verified, with the citation', () => {
    const { facts: next } = attachLookup(facts, values, '2026-09-09T10:00:00.000Z', MOT);
    const make = next.find((fact) => fact.key === 'make');

    assert.equal(make?.value, 'מאזדה');
    assert.equal(make?.source, 'verified');
    assert.equal(make?.sourceName, 'משרד התחבורה');
    assert.equal(make?.sourceDate, '2026-09-01');
  });

  it('leaves untouched facts as the seller declared them', () => {
    const { facts: next } = attachLookup(facts, values, '2026-09-09T10:00:00.000Z', MOT);
    const mileage = next.find((fact) => fact.key === 'mileage');

    // "Correct" and "verified" are different claims, and only one of them is
    // ours to make.
    assert.equal(mileage?.source, 'seller');
    assert.equal(mileage?.sourceName, undefined);
  });

  it('does not mutate the facts it was given', () => {
    const before = JSON.stringify(facts);
    attachLookup(facts, values, '2026-09-09T10:00:00.000Z', MOT);
    assert.equal(JSON.stringify(facts), before);
  });
});
