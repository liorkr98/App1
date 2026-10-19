import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePhotoReview, suggestedRoom } from './photo-review.js';
import { reviewSystem } from './photo-review-prompt.js';

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

describe('parsePhotoReview by category (18 Oct 2026)', () => {
  it('reads an angle and a colour for a car, and never a room', () => {
    assert.deepEqual(
      parsePhotoReview({ angle: 'frontLeft', room: 'kitchen', seen: ['silver', 'shelter', 'silver'], issues: ['plate'], score: 4 }, 'vehicle'),
      { angle: 'frontLeft', seen: ['silver'], issues: ['plate'], score: 4 },
    );
    assert.equal(parsePhotoReview({ angle: 'sideways-ish' }, 'vehicle'), undefined);
  });

  it('reads a room and what a flat shows, and never an angle', () => {
    assert.deepEqual(
      parsePhotoReview({ room: 'living', angle: 'front', seen: ['shelter', 'red', 'pool'], issues: [] }, 'property'),
      { room: 'living', seen: ['shelter'], issues: [] },
    );
  });

  it('asks each category its own question, in json', () => {
    assert.match(reviewSystem('vehicle'), /angle: .*frontLeft/);
    assert.match(reviewSystem('property'), /room: /);
    for (const category of ['vehicle', 'property'] as const) assert.match(reviewSystem(category), /json/);
  });
});
