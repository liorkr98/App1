import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DRAFT_VERSION, fromDraft, toDraft } from './draft.js';
import type { EditorState } from './editor.js';
import { answer, blankFacts } from './fact-entry.js';

const state = (): EditorState => ({
  category: 'property',
  photoCount: 6,
  facts: answer(blankFacts('property'), 'rooms', 4),
  description: 'הדירה משופצת ופונה לדרום.',
  template: 'clean',
  entitlement: 'paid',
});

const roundTrip = (value: EditorState) => fromDraft(JSON.stringify(toDraft(value)));

describe('a draft survives a refresh', () => {
  it('carries the work back', () => {
    const restored = roundTrip(state());

    assert.ok(restored);
    assert.equal(restored.category, 'property');
    assert.equal(restored.description, 'הדירה משופצת ופונה לדרום.');
    assert.equal(restored.template, 'clean');
    assert.equal(restored.facts.find((fact) => fact.key === 'rooms')?.value, 4);
  });

  it('keeps unanswered and absent apart across the round trip', () => {
    // The three states are the product (PRD §2). If storage collapses them, a
    // seller who marked "no parking" reopens their draft to find the question
    // unanswered — or worse, the other way.
    const facts = blankFacts('property').map((fact) =>
      fact.key === 'parking' ? { ...fact, present: false } : fact,
    );

    const restored = roundTrip({ ...state(), facts });
    assert.ok(restored);

    assert.equal(restored.facts.find((fact) => fact.key === 'parking')?.present, false);
    assert.equal(restored.facts.find((fact) => fact.key === 'elevator')?.present, true);
  });

  it('keeps false and 0 rather than dropping them as empty', () => {
    let facts = answer(blankFacts('property'), 'elevator', false);
    facts = answer(facts, 'balcony_sqm', 0);

    const restored = roundTrip({ ...state(), facts });
    assert.ok(restored);

    assert.equal(restored.facts.find((fact) => fact.key === 'elevator')?.value, false);
    assert.equal(restored.facts.find((fact) => fact.key === 'balcony_sqm')?.value, 0);
  });
});

describe('entitlement never comes back from storage', () => {
  it('is not written into a draft', () => {
    // Storage the user controls. If it went in, it could come out.
    const stored = JSON.stringify(toDraft(state()));

    assert.ok(!stored.includes('entitlement'));
    assert.ok(!stored.includes('paid'));
  });

  it('is not restored even when the stored JSON claims it', () => {
    // The attack, and it needs no tooling beyond devtools: set entitlement to
    // 'paid' in localStorage and reload. The restored draft must not carry
    // it — publishing is gated on a value this function cannot produce.
    const tampered = JSON.stringify({
      ...toDraft(state()),
      entitlement: 'paid',
    });

    const restored = fromDraft(tampered);
    assert.ok(restored);
    assert.ok(!('entitlement' in restored));
  });

  it('refuses a fact that claims to be verified', () => {
    // A מאומת badge asserts a public register answered, with a name and a
    // date beside it. A browser is not a public register, and PRD §5 calls
    // that rule legal rather than stylistic.
    const tampered = JSON.stringify({
      ...toDraft(state()),
      facts: blankFacts('property').map((fact) =>
        fact.key === 'rooms' ? { ...fact, source: 'verified' } : fact,
      ),
    });

    assert.equal(fromDraft(tampered), null);
  });
});

describe('anything unrecognised starts clean', () => {
  it('rejects junk rather than throwing', () => {
    // Not all of this is an attack. A quota error truncates a write, and a
    // half-written draft arrives as exactly this.
    for (const junk of ['', 'not json', '{', '[]', 'null', '"a string"', '{"version":1}']) {
      assert.equal(fromDraft(junk), null, junk);
    }
  });

  it('rejects a draft from an older version', () => {
    const old = JSON.stringify({ ...toDraft(state()), version: DRAFT_VERSION - 1 });
    assert.equal(fromDraft(old), null);
  });

  it('rejects a category that no longer exists', () => {
    const gone = JSON.stringify({ ...toDraft(state()), category: 'boat' });
    assert.equal(fromDraft(gone), null);
  });

  it('rejects a template that is not one of ours', () => {
    const bad = JSON.stringify({ ...toDraft(state()), template: 'custom' });
    assert.equal(fromDraft(bad), null);
  });

  it('never writes a photo count', () => {
    assert.ok(!JSON.stringify(toDraft(state())).includes('photoCount'));
  });

  it('ignores a stored photo count instead of trusting it', () => {
    // The photos are File objects behind object URLs; neither survives the
    // tab. A restored count with no restored photos would walk the seller
    // into a step that shows nothing, past a blocker that thinks it is
    // satisfied. Old drafts still carry the field, so it is ignored rather
    // than rejected — throwing away someone's work over a field we stopped
    // using is the worse failure.
    const stored = JSON.stringify({ ...toDraft(state()), photoCount: 6 });

    const restored = fromDraft(stored);
    assert.ok(restored);
    assert.ok(!('photoCount' in restored));
  });

  it('rejects a fact with the wrong shape', () => {
    const broken = [
      { key: '', label: 'x', type: 'text', value: null, present: true, required: false, source: 'seller' },
      { key: 'a', label: 'x', type: 'colour', value: null, present: true, required: false, source: 'seller' },
      { key: 'a', label: 'x', type: 'text', value: {}, present: true, required: false, source: 'seller' },
      { key: 'a', label: 'x', type: 'text', value: null, present: 'yes', required: false, source: 'seller' },
    ];

    for (const fact of broken) {
      const bad = JSON.stringify({ ...toDraft(state()), facts: [fact] });
      assert.equal(fromDraft(bad), null, JSON.stringify(fact));
    }
  });

  it('accepts a draft with nothing filled in yet', () => {
    // The common case, not an edge one: someone opens the editor, taps a
    // category and puts the phone down.
    const empty = JSON.stringify(
      toDraft({ photoCount: 0, facts: [], description: '', entitlement: 'unknown' }),
    );

    const restored = fromDraft(empty);
    assert.ok(restored);
    assert.equal(restored.category, undefined);
    assert.deepEqual(restored.facts, []);
  });
});
