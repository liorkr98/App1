import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normaliseAddress,
  normaliseText,
  splitHouseNumber,
  stripCorner,
  stripStreetPrefix,
  stripUnit,
} from './normalise.js';

/**
 * The variant list the stage asked for, as executable assertions rather than
 * prose. Every expected value here was produced by running the real
 * transformations, not written from memory.
 *
 * What is knowingly NOT handled is documented at the foot of normalise.ts —
 * misspellings, Arabic script, kibbutz addresses, building names. Those are
 * misses, not wrong answers.
 */

describe('the boulevard problem', () => {
  it('collapses every spelling of שדרות to one query', () => {
    // This is the whole point of the module. These four are one address, and
    // an unnormalised geocoder either misses or matches a different street.
    const variants = [
      "שד' ירושלים 12",
      'שדרות ירושלים 12',
      'שד ירושלים 12',
      'שד׳ ירושלים 12',
    ];

    const queries = new Set(variants.map((v) => normaliseAddress(v, 'חולון').query));

    assert.equal(queries.size, 1, `expected one query, got ${[...queries].join(' | ')}`);
    assert.equal([...queries][0], 'ירושלים 12 חולון');
  });

  it('collapses רחוב the same way', () => {
    const queries = new Set(
      ["רח' הרצל 5", 'רחוב הרצל 5', 'הרצל 5'].map((v) => normaliseAddress(v, 'תל אביב').query),
    );

    assert.equal(queries.size, 1);
    assert.equal([...queries][0], 'הרצל 5 תל אביב');
  });
});

describe('normaliseText', () => {
  it('folds every apostrophe variant onto geresh', () => {
    // A phone keyboard gives ASCII, iOS substitutes a curly quote, and the
    // correct character is U+05F3. None of them match each other.
    for (const quote of ["'", '‘', '’', '׳']) {
      assert.equal(normaliseText(`שד${quote}`), 'שד׳');
    }
  });

  it('folds double-quote variants onto gershayim', () => {
    for (const quote of ['"', '“', '”', '״']) {
      assert.equal(normaliseText(`ת${quote}א`), 'ת״א');
    }
  });

  it('strips invisible marks that survive copy-paste', () => {
    assert.equal(normaliseText('\u200Eהרצל\u200F'), 'הרצל');
  });

  it('collapses runs of whitespace', () => {
    assert.equal(normaliseText('  דרך   בגין  '), 'דרך בגין');
  });
});

describe('stripStreetPrefix', () => {
  it('removes the long and short forms', () => {
    assert.equal(stripStreetPrefix('שדרות ירושלים'), 'ירושלים');
    assert.equal(stripStreetPrefix('שד׳ ירושלים'), 'ירושלים');
    assert.equal(stripStreetPrefix('רחוב הרצל'), 'הרצל');
    assert.equal(stripStreetPrefix('דרך בגין'), 'בגין');
  });

  it('does not eat a street whose name starts with a prefix word', () => {
    // Longest-first ordering is what prevents "שד" matching inside "שדרות"
    // and leaving "רות" behind.
    assert.equal(stripStreetPrefix('שדרות ירושלים'), 'ירושלים');
  });

  it('leaves a bare street name alone', () => {
    assert.equal(stripStreetPrefix('סוקולוב'), 'סוקולוב');
  });
});

describe('stripUnit', () => {
  it('drops flat, floor and entrance fragments', () => {
    assert.equal(stripUnit('הרצל 5 דירה 12'), 'הרצל 5');
    assert.equal(stripUnit('הרצל 5 קומה 3'), 'הרצל 5');
    assert.equal(stripUnit('הרצל 5 כניסה א'), 'הרצל 5');
  });

  it('keeps a building NAME that begins with a fragment word', () => {
    // "מגדל אלרוב" is the address, not a unit inside one. The index check is
    // > 0 rather than >= 0 precisely for this.
    assert.equal(stripUnit('מגדל אלרוב'), 'מגדל אלרוב');
  });
});

describe('stripCorner', () => {
  it('takes the first street of a junction', () => {
    assert.equal(stripCorner('הרצל פינת אלנבי'), 'הרצל');
  });

  it('leaves an ordinary address alone', () => {
    assert.equal(stripCorner('הרצל 5'), 'הרצל 5');
  });
});

describe('splitHouseNumber', () => {
  it('splits a plain number', () => {
    assert.deepEqual(splitHouseNumber('סוקולוב 42'), {
      street: 'סוקולוב',
      houseNumber: '42',
    });
  });

  it('keeps a Hebrew letter suffix, which distinguishes real buildings', () => {
    assert.deepEqual(splitHouseNumber('אבן גבירול 12א'), {
      street: 'אבן גבירול',
      houseNumber: '12א',
    });
  });

  it('drops a slashed sub-unit, which is a flat not a building', () => {
    assert.deepEqual(splitHouseNumber('אבן גבירול 12/3'), {
      street: 'אבן גבירול',
      houseNumber: '12',
    });
  });

  it('returns no number when there is none', () => {
    assert.deepEqual(splitHouseNumber('כיכר רבין'), { street: 'כיכר רבין' });
  });

  it('handles a multi-word street name', () => {
    assert.deepEqual(splitHouseNumber('אבן גבירול 30'), {
      street: 'אבן גבירול',
      houseNumber: '30',
    });
  });
});

describe('normaliseAddress', () => {
  it('applies unit stripping BEFORE the house number is read', () => {
    // Order matters: read the number first and "הרצל 5 דירה 12" gives 12 —
    // the flat, not the building, and a geocoder would place it anywhere.
    const result = normaliseAddress('הרצל 5 דירה 12', 'תל אביב');

    assert.equal(result.houseNumber, '5');
    assert.equal(result.query, 'הרצל 5 תל אביב');
  });

  it('produces a query with no house number when there is none', () => {
    const result = normaliseAddress('הרצל פינת אלנבי', 'תל אביב');

    assert.equal(result.houseNumber, undefined);
    assert.equal(result.query, 'הרצל תל אביב');
  });

  it('normalises the city too', () => {
    assert.equal(normaliseAddress('הרצל 5', '  תל   אביב ').city, 'תל אביב');
  });
});
