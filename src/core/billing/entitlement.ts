import type { CustomerInfo } from 'react-native-purchases';

import { appConfig } from '@/core/config/app';

/**
 * ============================================================================
 * REQUIRES HUMAN REVIEW BEFORE MERGE — CLAUDE.md §6
 * ============================================================================
 *
 * This is the ONLY file in the codebase that reads `customerInfo.entitlements`
 * and decides whether a user has access. Everything else consumes the result.
 * It is deliberately tiny and dependency-free so it can be reviewed in one
 * sitting and unit-tested without a RevenueCat connection.
 *
 * The rules it implements, from §6:
 *
 *   - FAIL CLOSED. Unknown, errored, or absent entitlement state is treated as
 *     NOT subscribed. There is no code path here that grants access on a
 *     network failure.
 *   - No disk caching. This function is pure: it derives access from the
 *     CustomerInfo it is handed and stores nothing.
 *   - No custom receipt validation. RevenueCat owns that; this only reads the
 *     verdict RevenueCat already reached.
 *
 * ============================================================================
 */

export type EntitlementStatus = 'loading' | 'active' | 'inactive';

/**
 * Decides whether the given CustomerInfo grants the 'pro' entitlement.
 *
 * @param customerInfo RevenueCat's customer info, or null when it is unknown
 *                     (still loading, or the fetch failed).
 * @returns true only when RevenueCat positively reports the entitlement as
 *          active. Every other case — null, missing key, inactive — is false.
 */
export function hasActiveEntitlement(customerInfo: CustomerInfo | null): boolean {
  // Unknown state. Fail closed.
  if (!customerInfo) {
    return false;
  }

  // `entitlements.active` contains only entitlements RevenueCat currently
  // considers active, having already applied expiry, billing retry and grace
  // period. Reading `entitlements.all` and interpreting dates ourselves would
  // be exactly the custom validation §6 forbids.
  const entitlement = customerInfo.entitlements.active[appConfig.entitlementId];

  // Compare explicitly rather than coercing: a truthy object with isActive
  // false must not grant access.
  return entitlement?.isActive === true;
}

/**
 * Maps CustomerInfo to a status for the UI.
 *
 * `loading` is distinct from `inactive` so a paywall can show a spinner
 * instead of flashing "not subscribed" at a paying user during startup.
 * Callers must still treat `loading` as no-access when gating content.
 */
export function entitlementStatus(
  customerInfo: CustomerInfo | null,
  settled: boolean,
): EntitlementStatus {
  if (!settled) {
    return 'loading';
  }
  return hasActiveEntitlement(customerInfo) ? 'active' : 'inactive';
}
