import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HIGHLIGHT_LABELS, listingHighlights } from './highlights.js';

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

  it('the published list uses gershayim, not ASCII quotes', () => {
    const mamad = HIGHLIGHT_LABELS[0];
    assert.equal(mamad, 'ממ״ד');
    assert.ok([...mamad].some((ch) => ch.codePointAt(0) === 0x05f4));
  });
});
