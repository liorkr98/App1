import type { CustomerInfo } from 'react-native-purchases';
import { useCallback, useEffect, useState } from 'react';

import { entitlementStatus, hasActiveEntitlement, type EntitlementStatus } from './entitlement';
import { fetchCustomerInfo, isBillingConfigurable, onCustomerInfoUpdate } from './purchases';

/**
 * ============================================================================
 * REQUIRES HUMAN REVIEW BEFORE MERGE — CLAUDE.md §6
 * ============================================================================
 *
 * Subscription state for the UI. The access decision itself is delegated to
 * entitlement.ts; this hook only manages when that decision is recomputed.
 *
 * Deliberate properties:
 *   - State lives in memory only. Nothing is written to disk, so a stale cache
 *     can never grant access on a later launch (§6).
 *   - A failed fetch resolves to null, which entitlement.ts reads as no
 *     access. Airplane mode does not unlock the app.
 *   - `settled` flips to true even on failure, so the UI leaves the loading
 *     state and lands on "not subscribed" rather than hanging forever.
 *
 * ============================================================================
 */

export interface EntitlementState {
  status: EntitlementStatus;
  /** True only when RevenueCat positively reports 'pro' as active. */
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  refresh: () => Promise<void>;
}

export function useEntitlement(): EntitlementState {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [settled, setSettled] = useState(false);

  const refresh = useCallback(async () => {
    const info = await fetchCustomerInfo();
    setCustomerInfo(info);
    setSettled(true);
  }, []);

  useEffect(() => {
    // With no API key there is nothing to ask. Settle immediately as
    // not-subscribed rather than leaving the UI spinning.
    if (!isBillingConfigurable()) {
      setSettled(true);
      return;
    }

    let active = true;

    void fetchCustomerInfo().then((info) => {
      if (!active) return;
      setCustomerInfo(info);
      setSettled(true);
    });

    // RevenueCat pushes updates after a purchase, a restore, or a renewal
    // detected on another device. Subscribing keeps the UI honest without
    // polling.
    const unsubscribe = onCustomerInfoUpdate((info) => {
      setCustomerInfo(info);
      setSettled(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return {
    status: entitlementStatus(customerInfo, settled),
    isPro: hasActiveEntitlement(customerInfo),
    customerInfo,
    refresh,
  };
}
