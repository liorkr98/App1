import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import {
  BLOCKER_CODES,
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
  template: 'editorial',
  // The agent has a name and a dialable phone on their profile. Without this
  // the page's only button goes nowhere, so it blocks publishing.
  sellerReady: true,
  entitlement: 'paid',
});

describe('the seller gate', () => {
  it('blocks publishing when the profile cannot brand the listing', () => {
    const state = { ...ready(), sellerReady: false };

    assert.equal(canPublish(state), false);
    assert.ok(blockers(state).some((blocker) => blocker.code === 'sellerMissing'));
  });

  it('fails CLOSED when nobody passed the answer', () => {
    // undefined is not "fine", it is "nobody asked". A caller that forgets
    // this must get a blocked publish, not a page no buyer can reply to.
    const { sellerReady: _omitted, ...withoutIt } = ready();

    assert.equal(canPublish(withoutIt), false);
  });

  it('surfaces at publish, because it is fixed on another page', () => {
    // There is no step in this flow for it — /me is where it gets answered —
    // so the last gate is where it has to appear.
    const found = blockers({ ...ready(), sellerReady: false });
    const seller = found.find((blocker) => blocker.code === 'sellerMissing');

    assert.equal(seller?.step, 'publish');
  });

  it('does not stop a seller reaching the preview', () => {
    // Seeing the finished page is the conversion moment (§8), and an agent
    // who has not filled in their phone yet should still get there.
    assert.equal(canAdvance('preview', { ...ready(), sellerReady: false }), true);
  });
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

  it('names the missing fact, so the message can be actionable', () => {
    // The label rides on the blocker rather than being baked into a sentence
    // here: the copy lives in locales/he.json, and it needs something to
    // interpolate. "חסר: חדרים" is useful; "משהו חסר" is not.
    const found = blockers({ ...ready(), facts: [fact('rooms', 'חדרים', null, true)] });
    assert.equal(found.find((blocker) => blocker.code === 'factMissing')?.factLabel, 'חדרים');
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
    // the seller can act on only one of them. Same block, different code, so
    // the copy layer cannot accidentally collapse them into one sentence.
    assert.equal(
      blockers({ ...ready(), entitlement: 'unpaid' }).find((b) => b.step === 'publish')?.code,
      'paymentRequired',
    );
    assert.equal(
      blockers({ ...ready(), entitlement: 'unknown' }).find((b) => b.step === 'publish')?.code,
      'paymentUnverified',
    );
  });
});

describe('the blocker codes and their copy', () => {
  /**
   * Read, not imported. A JSON import would need resolveJsonModule and would
   * pull a file from outside this workspace's rootDir into the build output.
   * npm test runs from the repository root.
   */
  const he = JSON.parse(
    readFileSync(resolve(process.cwd(), 'locales/he.json'), 'utf8'),
  ) as { editor: { blockers: Record<string, string> } };

  it('has Hebrew copy for every code the machine can emit', () => {
    // The failure this catches: a new blocker ships, the seller is stopped,
    // and the reason renders as "editor.blockers.somethingNew" — or as
    // nothing at all, which is worse, because then they are stuck on a step
    // with no stated reason.
    for (const code of BLOCKER_CODES) {
      assert.ok(he.editor.blockers[code], `no Hebrew for ${code}`);
    }
  });

  it('has no copy for codes that no longer exist', () => {
    // The other direction. Dead copy is how a locale file becomes something
    // nobody trusts enough to edit.
    for (const key of Object.keys(he.editor.blockers)) {
      assert.ok(
        (BLOCKER_CODES as readonly string[]).includes(key),
        `${key} is in he.json but no blocker emits it`,
      );
    }
  });

  it('interpolates the image cap rather than spelling it out', () => {
    // 25 appears in exactly one place (MAX_IMAGES). A locale string with the
    // number written into it is a second place, and the two drift the day the
    // cap changes.
    //
    // Read into a local first: noUncheckedIndexedAccess makes an index into a
    // Record string|undefined, and the test above is what proves it is there.
    const message = he.editor.blockers.photosTooMany ?? '';

    assert.ok(message.includes('{max}'));
    assert.ok(!message.includes(String(MAX_IMAGES)));
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
