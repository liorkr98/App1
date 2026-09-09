import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import {
  blockers,
  canAdvance,
  canPublish,
  nextStep,
  MAX_IMAGES,
  stepsFor,
  type EditorState,
} from './editor.js';

const fact = (key: string, label: string, value: Fact['value'], required = false): Fact => ({
  key,
  label,
  value,
  type: 'text',
  present: true,
  required,
  source: 'seller',
});

/** A listing with nothing wrong with it. */
const ready = (): EditorState => ({
  category: 'property',
  photoCount: 6,
  facts: [
    fact('rooms', 'חדרים', 4, true),
    fact('area_sqm', 'מ״ר', 95, true),
    fact('parking', 'חניה', null),
  ],
  description: 'הדירה משופצת ופונה לדרום.',
  template: 'clean',
  entitlement: 'paid',
});

describe('stepsFor', () => {
  it('gives the vehicle flow a plate step', () => {
    assert.ok(stepsFor('vehicle').includes('plate'));
  });

  it('does not show a property seller a plate step', () => {
    assert.ok(!stepsFor('property').includes('plate'));
  });

  it('keeps the flow in order', () => {
    assert.deepEqual(stepsFor('property'), [
      'category',
      'photos',
      'facts',
      'description',
      'template',
      'preview',
      'publish',
    ]);
  });
});

describe('blockers', () => {
  it('finds nothing wrong with a complete listing', () => {
    assert.deepEqual(blockers(ready()), []);
  });

  it('reports EVERY problem at once, not the first', () => {
    // A seller who fixes one thing and is immediately told about another has
    // been made to walk the form twice, and on a phone that is where people
    // give up.
    const found = blockers({
      photoCount: 0,
      facts: [fact('rooms', 'חדרים', null, true)],
      description: '',
      entitlement: 'unpaid',
    });

    const steps = found.map((blocker) => blocker.step);
    assert.ok(steps.includes('category'));
    assert.ok(steps.includes('photos'));
    assert.ok(steps.includes('facts'));
    assert.ok(steps.includes('description'));
    assert.ok(steps.includes('template'));
    assert.ok(steps.includes('publish'));
  });

  it('names the missing fact, so the message is actionable', () => {
    const found = blockers({ ...ready(), facts: [fact('rooms', 'חדרים', null, true)] });
    assert.ok(found.some((blocker) => blocker.message.includes('חדרים')));
  });

  it('ignores optional facts left unanswered', () => {
    // value:null is "unanswered" and the page omits it. Only the three
    // required fields per category block anything.
    assert.deepEqual(blockers(ready()), []);
  });

  it('requires at least one photo, because index 0 is the cover', () => {
    assert.ok(blockers({ ...ready(), photoCount: 0 }).some((b) => b.step === 'photos'));
  });

  it('caps images at 25', () => {
    assert.deepEqual(blockers({ ...ready(), photoCount: MAX_IMAGES }), []);
    assert.ok(
      blockers({ ...ready(), photoCount: MAX_IMAGES + 1 }).some((b) => b.step === 'photos'),
    );
  });
});

describe('the description gate', () => {
  const generated = 'הדירה בת 4 חדרים ובה מעלית.';

  it('blocks publishing text the seller never touched', () => {
    const found = blockers({
      ...ready(),
      generatedDescription: generated,
      description: generated,
    });

    assert.ok(found.some((blocker) => blocker.step === 'description'));
  });

  it('clears once the seller has edited it', () => {
    const found = blockers({
      ...ready(),
      generatedDescription: generated,
      description: 'הדירה בת 4 חדרים, ובה מעלית וממ״ד.',
    });

    assert.deepEqual(found, []);
  });

  it('does not apply when the seller wrote it themselves', () => {
    // No generatedDescription means nothing was generated to review.
    assert.deepEqual(blockers({ ...ready(), description: 'כתבתי בעצמי.' }), []);
  });
});

describe('entitlement — fail closed', () => {
  it('publishes only when payment is confirmed', () => {
    assert.equal(canPublish({ ...ready(), entitlement: 'paid' }), true);
  });

  it('blocks when unpaid', () => {
    assert.equal(canPublish({ ...ready(), entitlement: 'unpaid' }), false);
  });

  it('BLOCKS when entitlement is unknown', () => {
    // The assertion that matters. A provider we could not reach is not a
    // licence to give the product away — an outage must never publish for
    // free (CLAUDE.md §8).
    assert.equal(canPublish({ ...ready(), entitlement: 'unknown' }), false);
  });

  it('says something different for unpaid than for unreachable', () => {
    // "Pay to publish" and "we could not check" are different situations and
    // the seller can act on only one of them.
    const unpaid = blockers({ ...ready(), entitlement: 'unpaid' });
    const unknown = blockers({ ...ready(), entitlement: 'unknown' });

    assert.notEqual(
      unpaid.find((b) => b.step === 'publish')?.message,
      unknown.find((b) => b.step === 'publish')?.message,
    );
  });
});

describe('canAdvance', () => {
  it('lets an unpaid seller reach the preview', () => {
    // The preview is the conversion moment (§8): the seller sees their
    // finished page and then pays to share it. Gating it earlier hides the
    // thing that sells the product.
    const unpaid = { ...ready(), entitlement: 'unpaid' as const };

    assert.equal(canAdvance('preview', unpaid), true);
    assert.equal(canPublish(unpaid), false);
  });

  it('stops a seller leaving a step that is incomplete', () => {
    assert.equal(canAdvance('photos', { ...ready(), photoCount: 0 }), false);
  });
});

describe('nextStep — where a returning seller lands', () => {
  it('starts at the beginning for an empty listing', () => {
    assert.equal(
      nextStep({ photoCount: 0, facts: [], description: '', entitlement: 'unknown' }),
      'category',
    );
  });

  it('lands on the step that NEEDS work, not the last one finished', () => {
    // The category is already chosen here. Sending the seller back to it
    // would make them walk forward through finished steps to find the one
    // that actually wants them.
    assert.equal(nextStep({ ...ready(), photoCount: 0 }), 'photos');
  });

  it('lands on publish when only payment is outstanding', () => {
    // That step is where the paywall lives, so this shows the one action
    // left rather than hiding it behind the preview.
    assert.equal(nextStep({ ...ready(), entitlement: 'unpaid' }), 'publish');
  });

  it('lands on publish when everything clears', () => {
    assert.equal(nextStep(ready()), 'publish');
  });

  it('skips the plate step for a property', () => {
    assert.notEqual(nextStep({ ...ready(), photoCount: 0 }), 'plate');
  });
});
