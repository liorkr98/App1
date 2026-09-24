import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answer, blankFacts, markAbsent } from './fact-entry.js';
import { arnonaFiguresAgree, monthlyCost, pairedCellText } from './monthly-cost.js';

describe('monthlyCost', () => {
  it('returns both amounts only when arnona and va’ad are present', () => {
    const facts = answer(answer(blankFacts('property'), 'property_tax', 820), 'building_fee', 380);
    assert.deepEqual(monthlyCost(facts), { arnonaIls: 410, arnonaBillIls: 820, vaadIls: 380 });
  });

  it('halves arnona because the schema unit is bi-monthly', () => {
    const facts = answer(answer(blankFacts('property'), 'property_tax', 640), 'building_fee', 250);
    assert.equal(monthlyCost(facts)?.arnonaIls, 320);
  });

  it('omits the line when only arnona is answered', () => {
    const facts = answer(blankFacts('property'), 'property_tax', 410);
    assert.equal(monthlyCost(facts), null);
  });

  it('omits the line when only va’ad is answered', () => {
    const facts = answer(blankFacts('property'), 'building_fee', 380);
    assert.equal(monthlyCost(facts), null);
  });

  it('omits the line when va’ad is confirmed absent', () => {
    const facts = markAbsent(answer(blankFacts('property'), 'property_tax', 820), 'building_fee');
    assert.equal(monthlyCost(facts), null);
  });

  it('omits the line on a vehicle with no such facts', () => {
    assert.equal(monthlyCost(blankFacts('vehicle')), null);
  });

  it('never shows arnona as two different amounts', () => {
    const facts = answer(answer(blankFacts('property'), 'property_tax', 800), 'building_fee', 200);
    const cost = monthlyCost(facts);
    assert.equal(cost?.arnonaBillIls, 800);
    assert.equal(cost?.arnonaIls, 400);
    assert.equal(arnonaFiguresAgree(facts), true);
  });

  it('still agrees when arnona was not answered', () => {
    assert.equal(arnonaFiguresAgree(blankFacts('property')), true);
  });
});

describe('pairedCellText', () => {
  it('keeps 3 / 5 as one string so one <bdi> can isolate it', () => {
    assert.equal(pairedCellText('3', '5'), '3 / 5');
  });

  it('leaves a lone value alone', () => {
    assert.equal(pairedCellText('95'), '95');
  });
});
