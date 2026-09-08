import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { containsHebrew, containsSentinel, HEBREW_SENTINEL, normalise } from './hebrew.js';

describe('containsHebrew', () => {
  it('finds Hebrew letters', () => {
    assert.equal(containsHebrew('דירת 4 חדרים'), true);
  });

  it('is not fooled by a page of boxes', () => {
    // What a PDF with unembedded fonts extracts as: geometry, no text.
    assert.equal(containsHebrew('        '), false);
    assert.equal(containsHebrew(''), false);
  });

  it('does not count Latin or digits as Hebrew', () => {
    assert.equal(containsHebrew('4 rooms, 92 sqm, Tel Aviv'), false);
  });
});

describe('normalise', () => {
  it('strips the bidi marks the RTL helpers insert', () => {
    // U+200E LEFT-TO-RIGHT MARK is what src/core/i18n/format.ts wraps numbers
    // in, and it survives all the way into extracted PDF text.
    assert.equal(normalise(`\u200E1,250,000\u200E`), '1,250,000');
  });

  it('collapses the whitespace that glyph runs leave behind', () => {
    assert.equal(normalise('שליחת   הודעה\n בוואטסאפ'), 'שליחת הודעה בוואטסאפ');
  });
});

describe('containsSentinel', () => {
  it('matches text extracted in logical order', () => {
    assert.equal(containsSentinel(`כותרת ${HEBREW_SENTINEL} סוף`), true);
  });

  it('matches text extracted in visual order', () => {
    // Some PDF producers emit RTL runs reversed. Rejecting those would fail
    // roughly half of perfectly good files.
    const visual = [...HEBREW_SENTINEL].reverse().join('');
    assert.equal(containsSentinel(`prefix ${visual} suffix`), true);
  });

  it('matches across the run splitting that glyph positioning causes', () => {
    assert.equal(containsSentinel('שליחת\n  הודעה\n  בוואטסאפ'), true);
  });

  it('does not match a different Hebrew string', () => {
    assert.equal(containsSentinel('מחיר מחירון'), false);
  });

  it('never matches on an empty sentinel', () => {
    assert.equal(containsSentinel('anything at all', ''), false);
  });
});

describe('the sentinel itself', () => {
  /**
   * The point of the check is that it is the SAME string the page renders.
   * A sentinel that has drifted from the template still passes every test
   * above and proves nothing about the real PDF, so the source of truth is
   * asserted directly.
   */
  it('is byte-identical to the CTA in the web template', async () => {
    const cta = await readFile(new URL('../../../web/src/components/CtaDock.astro', import.meta.url), 'utf8');

    assert.ok(
      cta.includes(HEBREW_SENTINEL),
      'CtaDock.astro no longer contains the sentinel — update HEBREW_SENTINEL in the same commit',
    );
  });
});
