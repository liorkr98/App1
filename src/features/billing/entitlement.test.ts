import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decisionCapped, entitlementFromDecision, publishRefusal } from './entitlement.js';

describe('entitlementFromDecision — fail closed (CLAUDE.md §8)', () => {
  it('is unknown when the read failed, even with a row that says allowed', () => {
    assert.equal(entitlementFromDecision({ allowed: true, reason: null, credit: false }, true), 'unknown');
  });

  it('is unknown with no row', () => {
    assert.equal(entitlementFromDecision(null, false), 'unknown');
    assert.equal(entitlementFromDecision(undefined, false), 'unknown');
  });

  it('is unknown when the row is malformed, never paid', () => {
    assert.equal(entitlementFromDecision({ allowed: 'true', credit: false }, false), 'unknown');
    assert.equal(entitlementFromDecision({ allowed: true }, false), 'unknown');
    assert.equal(entitlementFromDecision('allowed', false), 'unknown');
  });

  it('is paid when allowed without our credit', () => {
    assert.equal(entitlementFromDecision({ allowed: true, reason: null, credit: false }, false), 'paid');
  });

  it('is free when allowed with our credit (a free slot or a one-time page)', () => {
    assert.equal(entitlementFromDecision({ allowed: true, reason: null, credit: true }, false), 'free');
  });

  it('is unpaid when refused, whatever the credit says', () => {
    assert.equal(entitlementFromDecision({ allowed: false, reason: 'free_limit', credit: false }, false), 'unpaid');
    assert.equal(entitlementFromDecision({ allowed: false, reason: 'free_limit', credit: true }, false), 'unpaid');
  });
});

describe('publishRefusal — reading the trigger', () => {
  it('maps PT402 free_limit to the paywall', () => {
    assert.equal(publishRefusal({ code: 'PT402', message: 'free_limit' }), 'free_limit');
  });

  it('maps PT402 plan_limit to the upgrade paywall, and only that reason', () => {
    assert.equal(publishRefusal({ code: 'PT402', message: 'plan_limit' }), 'plan_limit');
    assert.equal(decisionCapped({ allowed: false, reason: 'plan_limit', credit: true }), true);
    assert.equal(decisionCapped({ allowed: false, reason: 'free_limit', credit: true }), false);
    assert.equal(decisionCapped(null), false);
    // A capped decision is still not paid: the paywall, never a publish.
    assert.equal(entitlementFromDecision({ allowed: false, reason: 'plan_limit', credit: true }, false), 'unpaid');
  });

  it('maps any other PT402 to unknown', () => {
    assert.equal(publishRefusal({ code: 'PT402', message: 'publish_unknown' }), 'publish_unknown');
    assert.equal(publishRefusal({ code: 'PT402' }), 'publish_unknown');
  });

  it('is null for errors that are not the publish gate', () => {
    assert.equal(publishRefusal({ code: '23505', message: 'duplicate' }), null);
    assert.equal(publishRefusal(null), null);
  });
});
