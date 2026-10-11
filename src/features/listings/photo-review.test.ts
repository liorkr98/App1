import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePhotoReview, suggestedRoom } from './photo-review.js';

describe('parsePhotoReview', () => {
  it('keeps a known room, issue and tip, and drops a guess', () => {
    const parsed = parsePhotoReview({
      room: 'kitchen',
      confidence: 0.8,
      issues: ['dark', 'invented'],
      tip: 'turnOnLight',
      score: 2,
    });
    assert.deepEqual(parsed, {
      room: 'kitchen',
      confidence: 0.8,
      issues: ['dark'],
      tip: 'turnOnLight',
      score: 2,
    });
    assert.equal(parsePhotoReview({ room: 'ballroom', issues: ['nope'], tip: 'sing' }), undefined);
    assert.equal(parsePhotoReview('dark'), undefined);
    assert.deepEqual(
      parsePhotoReview('{"room":"balcony","confidence":0.9,"issues":[],"score":5}'),
      { room: 'balcony', confidence: 0.9, issues: [], score: 5 },
    );
  });
});

describe('suggestedRoom', () => {
  it('fills an unlabelled photo only when the model is sure, and never overwrites', () => {
    const review = parsePhotoReview({ room: 'bedroom', confidence: 0.7, issues: [] });
    assert.ok(review);
    assert.equal(suggestedRoom(review!, undefined), 'bedroom');
    assert.equal(suggestedRoom(review!, 'kitchen'), undefined);
    assert.equal(suggestedRoom({ ...review!, confidence: 0.4 }, undefined), undefined);
  });
});
