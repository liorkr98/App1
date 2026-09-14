import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entitlementFromAllowlist } from './entitlement.js';

describe('entitlementFromAllowlist — fail closed', () => {
  it('grants only when a row is present and the read succeeded', () => {
    assert.equal(
      entitlementFromAllowlist({ user_id: 'user-1' }, false),
      'paid',
    );
  });

  it('is unpaid when the agent is simply not on the list', () => {
    assert.equal(entitlementFromAllowlist(null, false), 'unpaid');
  });

  it('is unknown when the read failed, even if a row was also returned', () => {
    // A caller that both errored and produced a body is a confused caller.
    // Unknown, not paid: we do not trust a row that arrived with an error.
    assert.equal(
      entitlementFromAllowlist({ user_id: 'user-1' }, true),
      'unknown',
    );
  });

  it('is unknown when the read failed and there is no row', () => {
    assert.equal(entitlementFromAllowlist(null, true), 'unknown');
  });
});
