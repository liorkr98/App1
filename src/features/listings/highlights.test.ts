import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import { HIGHLIGHT_LABELS, listingHighlights, resolveHighlights, suggestHighlights } from './highlights.js';

const fact = (key: string, value: Fact['value'], type: Fact['type'] = 'number'): Fact => ({
  key,
  label: key,
  value,
  type,
  present: true,
  required: false,
  source: 'seller',
});

describe('listingHighlights', () => {
  it('returns nothing when the agent chose none', () => {
    assert.deepEqual(listingHighlights(undefined), []);
    assert.deepEqual(listingHighlights([]), []);
  });

  it('keeps at most three, in order, skipping blanks', () => {
    assert.deepEqual(
      listingHighlights(['ממ״ד', '  ', 'מרפסת שמש', 'חניה', 'מעלית']),
      ['ממ״ד', 'מרפסת שמש', 'חניה'],
    );
  });

  it('dedupes', () => {
    assert.deepEqual(listingHighlights(['חניה', 'חניה', 'מעלית']), ['חניה', 'מעלית']);
  });

  it('suggests the terrace when it is at least half the flat', () => {
    const chips = suggestHighlights([
      fact('area_sqm', 69),
      fact('balcony_sqm', 70),
      fact('shelter', true, 'boolean'),
      fact('parking', false, 'boolean'),
    ]);
    assert.equal(chips[0], 'מרפסת 70 מ״ר');
    assert.ok(chips.includes('ממ״ד'));
    assert.equal(chips.includes('חניה'), false);
    assert.ok(chips.length <= 3);
  });

  it('suggests the top floor and a renovation ahead of ordinary features', () => {
    const chips = suggestHighlights([
      fact('floor', 4),
      fact('total_floors', 4),
      fact('condition', 'משופץ', 'enum'),
      fact('elevator', true, 'boolean'),
    ]);
    assert.deepEqual(chips, ['קומה אחרונה', 'משופצת', 'מעלית']);
  });

  it('keeps an agent choice and does not invent over it', () => {
    assert.deepEqual(
      resolveHighlights(['חניה'], [fact('area_sqm', 69), fact('balcony_sqm', 70)]),
      ['חניה'],
    );
  });

  it('suggests when the agent left the list empty', () => {
    assert.deepEqual(
      resolveHighlights(undefined, [fact('shelter', true, 'boolean')]),
      ['ממ״ד'],
    );
  });

  it('the published list uses gershayim, not ASCII quotes', () => {
    const mamad = HIGHLIGHT_LABELS[0];
    assert.equal(mamad, 'ממ״ד');
    assert.ok([...mamad].some((ch) => ch.codePointAt(0) === 0x05f4));
  });
});
