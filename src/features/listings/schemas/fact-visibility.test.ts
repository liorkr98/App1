import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blankFacts } from '../fact-entry.js';
import { factShown, factUnlocked, factVisibleFor, schemaFor } from './index.js';

describe('investment listings ask about tenants, not entry date', () => {
  const schema = schemaFor('property');
  const entry = schema.facts.find((fact) => fact.key === 'entry_date');
  const tenants = schema.facts.find((fact) => fact.key === 'has_tenants');
  const rent = schema.facts.find((fact) => fact.key === 'rent_amount');
  const ends = schema.facts.find((fact) => fact.key === 'rent_end');

  it('hides entry date from an investor', () => {
    assert.equal(factVisibleFor(entry, 'investor'), false);
    assert.equal(factVisibleFor(entry, 'resident'), true);
    assert.equal(factVisibleFor(entry, 'both'), true);
    assert.equal(factVisibleFor(entry, undefined), true);
  });

  it('asks an investor about tenants, rent, and when the lease ends', () => {
    assert.equal(factVisibleFor(tenants, 'investor'), true);
    assert.equal(factVisibleFor(rent, 'investor'), true);
    assert.equal(factVisibleFor(ends, 'investor'), true);
    assert.equal(factVisibleFor(tenants, 'resident'), false);
    assert.equal(factVisibleFor(tenants, undefined), false);
  });

  it('waits on "there are tenants" before asking how much they pay', () => {
    const facts = blankFacts('property');
    assert.equal(factUnlocked(rent, facts), false);
    assert.equal(factShown(rent, 'investor', facts), false);

    const withTenants = facts.map((fact) =>
      fact.key === 'has_tenants' ? { ...fact, value: true } : fact,
    );
    assert.equal(factUnlocked(rent, withTenants), true);
    assert.equal(factShown(rent, 'investor', withTenants), true);
    assert.equal(factShown(rent, 'resident', withTenants), false);
  });
});
