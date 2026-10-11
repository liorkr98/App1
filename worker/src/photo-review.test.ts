import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseReviewAnswer } from './photo-review.js';

describe('parseReviewAnswer', () => {
  it('keeps known keys and drops the rest', () => {
    const parsed = parseReviewAnswer({
      room: 'kitchen',
      confidence: 0.8,
      issues: ['dark', 'nope'],
      tip: 'turnOnLight',
      score: 4,
    });
    assert.deepEqual(parsed, {
      room: 'kitchen',
      confidence: 0.8,
      issues: ['dark'],
      tip: 'turnOnLight',
      score: 4,
    });
  });

  it('reads a JSON string and refuses an empty answer', () => {
    assert.equal(parseReviewAnswer('{"issues":["blurry"],"score":2}')?.issues[0], 'blurry');
    assert.equal(parseReviewAnswer({ room: 'ballroom', issues: [] }), undefined);
    assert.equal(parseReviewAnswer('not json'), undefined);
  });
});
