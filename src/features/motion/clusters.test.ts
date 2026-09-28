import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clusters } from './clusters.js';

describe('clusters', () => {
  it('splits plain Hebrew one letter per cluster', () => {
    assert.deepEqual(clusters('דירה'), ['ד', 'י', 'ר', 'ה']);
  });

  it('keeps gershayim on the letter before it', () => {
    // ממ״ד: the U+05F4 rides on the second mem, it never floats alone.
    assert.deepEqual(clusters('ממ״ד'), ['מ', 'מ״', 'ד']);
  });

  it('keeps niqqud on its letter', () => {
    assert.deepEqual(clusters('שָׁלוֹם'), ['שָׁ', 'ל', 'וֹ', 'ם']);
  });

  it('never starts a cluster with a mark', () => {
    assert.deepEqual(clusters('״א'), ['״', 'א']);
  });

  it('passes digits and Latin through', () => {
    assert.deepEqual(clusters('4K'), ['4', 'K']);
  });
});
