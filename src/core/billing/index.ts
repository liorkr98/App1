export { Paywall, type PaywallProps } from './Paywall';

// The two entitlement exports below are the reviewed surface (CLAUDE.md §6).
// Anything gating paid content must go through them rather than reading
// customerInfo directly.
export { entitlementStatus, hasActiveEntitlement, type EntitlementStatus } from './entitlement';
export { useEntitlement, type EntitlementState } from './useEntitlement';

export { useOfferings } from './useOfferings';
export {
  identifyBillingUser,
  initBilling,
  isBillingConfigurable,
  purchasePackage,
  resetBillingUser,
  restorePurchases,
} from './purchases';
