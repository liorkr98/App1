import type { CustomerInfo } from 'react-native-purchases';

import { entitlementStatus, hasActiveEntitlement } from './entitlement';

/**
 * Tests for the fail-closed rule in CLAUDE.md §6.
 *
 * These exist to make a regression here loud. Granting access to a
 * non-subscriber is a revenue bug; denying it to a subscriber is a support
 * bug. Both start in this function.
 */

/** Minimal CustomerInfo shaped enough for the entitlement check. */
function customerInfo(active: Record<string, { isActive: boolean }>): CustomerInfo {
  return { entitlements: { active } } as unknown as CustomerInfo;
}

describe('hasActiveEntitlement — fails closed', () => {
  it('denies access when customer info is unknown (null)', () => {
    // This is the airplane-mode and failed-fetch case.
    expect(hasActiveEntitlement(null)).toBe(false);
  });

  it('denies access when there are no active entitlements at all', () => {
    expect(hasActiveEntitlement(customerInfo({}))).toBe(false);
  });

  it('denies access when a different entitlement is active', () => {
    expect(hasActiveEntitlement(customerInfo({ plus: { isActive: true } }))).toBe(false);
  });

  it('denies access when the pro entitlement is present but not active', () => {
    expect(hasActiveEntitlement(customerInfo({ pro: { isActive: false } }))).toBe(false);
  });

  it('grants access only when pro is positively active', () => {
    expect(hasActiveEntitlement(customerInfo({ pro: { isActive: true } }))).toBe(true);
  });
});

describe('entitlementStatus', () => {
  it('reports loading until the first fetch settles', () => {
    expect(entitlementStatus(null, false)).toBe('loading');
    expect(entitlementStatus(customerInfo({ pro: { isActive: true } }), false)).toBe('loading');
  });

  it('reports inactive once settled with no entitlement', () => {
    expect(entitlementStatus(null, true)).toBe('inactive');
  });

  it('reports active once settled with the entitlement', () => {
    expect(entitlementStatus(customerInfo({ pro: { isActive: true } }), true)).toBe('active');
  });
});
