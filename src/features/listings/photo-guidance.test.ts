import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { photoWarnings, preferredCoverIndex } from './photo-guidance.js';

describe('photoWarnings', () => {
  it('warns and does not invent a block', () => {
    assert.deepEqual(photoWarnings(Array.from({ length: 6 }, () => ({ width: 1600, height: 1200 }))), ['few']);
    assert.deepEqual(photoWarnings([{ width: 900, height: 1600 }]), ['few', 'portraitCover', 'narrow']);
    assert.equal(photoWarnings([]).length, 0);
  });
});

describe('preferredCoverIndex', () => {
  it('picks the first landscape frame, not the first frame', () => {
    assert.equal(
      preferredCoverIndex([
        { width: 800, height: 1200 },
        { width: 1600, height: 1200 },
      ]),
      1,
    );
    assert.equal(preferredCoverIndex([{ width: 800, height: 1200 }]), 0);
  });
});
