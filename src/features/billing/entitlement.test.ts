import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  entitlementFromAllowlist,
  entitlementFromGrants,
  type GrantRow,
} from './entitlement.js';

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
    assert.equal(
      entitlementFromAllowlist({ user_id: 'user-1' }, true),
      'unknown',
    );
  });

  it('is unknown when the read failed and there is no row', () => {
    assert.equal(entitlementFromAllowlist(null, true), 'unknown');
  });
});

const now = new Date('2026-09-15T12:00:00.000Z');

function grant(overrides: Partial<GrantRow> = {}): GrantRow {
  return {
    remaining: 1,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_to: null,
    ...overrides,
  };
}

describe('entitlementFromGrants — fail closed', () => {
  it('grants when a live row has remaining listings', () => {
    assert.equal(entitlementFromGrants([grant()], false, now), 'paid');
  });

  it('is free when there are no grants and nothing published yet', () => {
    assert.equal(entitlementFromGrants([], false, now, 0), 'free');
    assert.equal(entitlementFromGrants(null, false, now, 0), 'free');
  });

  it('is unpaid when the free listing is already used and no grant is live', () => {
    assert.equal(entitlementFromGrants([], false, now, 1), 'unpaid');
    assert.equal(entitlementFromGrants([grant({ remaining: 0 })], false, now, 1), 'unpaid');
  });

  it('is unpaid when the window has not started', () => {
    assert.equal(
      entitlementFromGrants([grant({ effective_from: '2026-12-01T00:00:00.000Z' })], false, now, 1),
      'unpaid',
    );
  });

  it('is unpaid when the window has ended', () => {
    assert.equal(
      entitlementFromGrants([grant({ effective_to: '2026-09-01T00:00:00.000Z' })], false, now, 1),
      'unpaid',
    );
  });

  it('is unknown when the read failed, even if rows were also returned', () => {
    assert.equal(entitlementFromGrants([grant()], true, now), 'unknown');
  });

  it('is unknown when the published count could not be read', () => {
    assert.equal(entitlementFromGrants([], false, now, null), 'unknown');
  });

  it('treats a stack of grants as paid if any one of them is live', () => {
    assert.equal(
      entitlementFromGrants(
        [grant({ remaining: 0 }), grant({ remaining: 2 })],
        false,
        now,
      ),
      'paid',
    );
  });
});
