import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answer, answered, blankFacts, clear, markAbsent } from './fact-entry.js';
import { schemaFor } from './schemas/index.js';

const find = (facts: ReturnType<typeof blankFacts>, key: string) => {
  const fact = facts.find((candidate) => candidate.key === key);
  assert.ok(fact, `no fact ${key}`);
  return fact;
};

describe('blankFacts', () => {
  it('covers every field in the schema, in schema order', () => {
    assert.deepEqual(
      blankFacts('property').map((fact) => fact.key),
      schemaFor('property').facts.map((definition) => definition.key),
    );
  });

  it('starts every fact unanswered, not absent', () => {
    // value:null with present:true. The page omits these; it does not render
    // אין next to every field the seller has not reached yet.
    for (const fact of blankFacts('vehicle')) {
      assert.equal(fact.value, null);
      assert.equal(fact.present, true);
    }
  });

  it('marks exactly the required fields required', () => {
    const required = blankFacts('property')
      .filter((fact) => fact.required)
      .map((fact) => fact.key);

    assert.deepEqual(
      required,
      schemaFor('property')
        .facts.filter((definition) => definition.required === true)
        .map((definition) => definition.key),
    );
  });

  it('attributes everything to the SELLER, including verifiable fields', () => {
    // The assertion that matters here. The vehicle schema marks eight fields
    // 'verified', which says the Ministry of Transport CAN answer them — not
    // that it did. A seller typing a mileage is not a public register, and
    // publishing what they typed under a מאומת badge is a false citation.
    // PRD §5 calls these rules legal, not stylistic.
    const verifiable = schemaFor('vehicle').facts.filter(
      (definition) => definition.source === 'verified',
    );
    assert.ok(verifiable.length > 0, 'the vehicle schema should have verifiable fields');

    for (const fact of blankFacts('vehicle')) {
      assert.equal(fact.source, 'seller', `${fact.key} must not start verified`);
    }
  });

  it('carries the unit through, so the grid can render it', () => {
    assert.equal(find(blankFacts('property'), 'balcony_sqm').unit, 'מ״ר');
  });
});

describe('the three states', () => {
  it('answering sets a value and leaves it present', () => {
    const facts = answer(blankFacts('property'), 'rooms', 4);

    assert.equal(find(facts, 'rooms').value, 4);
    assert.equal(find(facts, 'rooms').present, true);
  });

  it('marking absent is NOT the same as leaving it blank', () => {
    // Both have a null value. Only one of them is a statement.
    const blank = find(blankFacts('property'), 'parking');
    const absent = find(markAbsent(blankFacts('property'), 'parking'), 'parking');

    assert.equal(blank.value, null);
    assert.equal(absent.value, null);
    assert.notEqual(blank.present, absent.present);
  });

  it('drops the value when a feature is marked absent', () => {
    // A stale number behind present:false is how a cell reading אין ends up
    // carrying the size the seller entered before they corrected themselves.
    const facts = markAbsent(answer(blankFacts('property'), 'balcony_sqm', 12), 'balcony_sqm');

    assert.equal(find(facts, 'balcony_sqm').value, null);
    assert.equal(find(facts, 'balcony_sqm').present, false);
  });

  it('answering an absent fact takes back the absence', () => {
    // The seller changed their mind. Leaving present:false would publish a
    // balcony size underneath the word אין.
    const facts = answer(markAbsent(blankFacts('property'), 'balcony_sqm'), 'balcony_sqm', 12);

    assert.equal(find(facts, 'balcony_sqm').value, 12);
    assert.equal(find(facts, 'balcony_sqm').present, true);
  });

  it('clearing returns to unanswered, not to absent', () => {
    const facts = clear(markAbsent(blankFacts('property'), 'parking'), 'parking');

    assert.equal(find(facts, 'parking').value, null);
    assert.equal(find(facts, 'parking').present, true);
  });

  it('changes only the fact it is given', () => {
    const before = blankFacts('property');
    const after = answer(before, 'rooms', 4);

    for (const fact of after) {
      if (fact.key === 'rooms') continue;
      assert.deepEqual(fact, find(before, fact.key));
    }
  });
});

describe('answered', () => {
  it('keeps answers and confirmed absences, drops the untouched', () => {
    let facts = blankFacts('property');
    facts = answer(facts, 'rooms', 4);
    facts = markAbsent(facts, 'parking');

    const keys = answered(facts).map((fact) => fact.key);

    assert.ok(keys.includes('rooms'), 'an answer belongs on the page');
    // אין is information — "no parking" is a thing a buyer wants to know.
    assert.ok(keys.includes('parking'), 'a confirmed absence belongs on the page');
    assert.ok(!keys.includes('elevator'), 'an unanswered field is omitted');
  });

  it('treats false as an answer, not as emptiness', () => {
    // The classic falsy bug. A boolean fact answered false is answered.
    const facts = answer(blankFacts('property'), 'elevator', false);

    assert.ok(answered(facts).some((fact) => fact.key === 'elevator'));
  });

  it('treats zero as an answer', () => {
    const facts = answer(blankFacts('property'), 'balcony_sqm', 0);

    assert.ok(answered(facts).some((fact) => fact.key === 'balcony_sqm'));
  });
});
