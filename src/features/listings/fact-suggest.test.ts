import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import { blankFacts, markAbsent, answer } from './fact-entry.js';
import { suggestFacts } from './fact-suggest.js';
import { factDefinition } from './schemas/index.js';
import type { PhotoReview } from './photo-review.js';

const seen = (...items: NonNullable<PhotoReview['seen']>): PhotoReview => ({ issues: [], seen: items });

describe('suggestFacts — what the photographs suggest (18 Oct 2026)', () => {
  it('suggests what a photograph shows, for unanswered facts only', () => {
    let facts: Fact[] = blankFacts('property');
    facts = answer(facts, 'parking', false);
    const out = suggestFacts([seen('shelter', 'parking'), seen('renovated')], facts, 'property');
    assert.deepEqual(out, [
      { key: 'shelter', seen: 'shelter', kind: 'present' },
      { key: 'condition', seen: 'renovated', kind: 'option', option: 'משופץ' },
    ]);
  });

  it('never second-guesses a fact the seller marked absent', () => {
    const facts = markAbsent(blankFacts('property'), 'shelter');
    assert.deepEqual(suggestFacts([seen('shelter')], facts, 'property'), []);
  });

  it('never suggests absence: nothing seen is nothing said', () => {
    assert.deepEqual(suggestFacts([seen(), { issues: [] }], blankFacts('property'), 'property'), []);
  });

  it('says nothing about the condition when the photographs disagree', () => {
    assert.deepEqual(suggestFacts([seen('renovated'), seen('needsRenovation')], blankFacts('property'), 'property'), []);
  });

  it('takes the colour most photographs agree on, and no colour on a tie', () => {
    const facts = blankFacts('vehicle');
    assert.deepEqual(suggestFacts([seen('silver'), seen('silver'), seen('grey')], facts, 'vehicle'), [
      { key: 'color', seen: 'silver', kind: 'colour' },
    ]);
    assert.deepEqual(suggestFacts([seen('silver'), seen('grey')], facts, 'vehicle'), []);
    assert.deepEqual(suggestFacts([seen('silver')], answer(facts, 'color', 'כסוף'), 'vehicle'), []);
  });
});

describe('the condition it suggests is the schema’s own wording', () => {
  it('matches an option of the property schema exactly', () => {
    const options = factDefinition('property', 'condition')?.options ?? [];
    for (const suggestion of suggestFacts([seen('renovated')], blankFacts('property'), 'property')) {
      if (suggestion.kind === 'option') assert.ok(options.includes(suggestion.option), suggestion.option);
    }
    for (const suggestion of suggestFacts([seen('needsRenovation')], blankFacts('property'), 'property')) {
      if (suggestion.kind === 'option') assert.ok(options.includes(suggestion.option), suggestion.option);
    }
  });
});
