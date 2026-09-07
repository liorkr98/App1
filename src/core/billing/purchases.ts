import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { env } from '@/core/config/env';

/**
 * RevenueCat SDK wrapper.
 *
 * Scaffolding only — no access decisions are made here. The single place that
 * decides entitlement is src/core/billing/entitlement.ts (CLAUDE.md §6).
 */

let configured = false;

/** True when a platform key is present. Without one, billing stays inert. */
export function isBillingConfigurable(): boolean {
  return Boolean(Platform.OS === 'ios' ? env.revenueCat.iosKey : env.revenueCat.androidKey);
}

/**
 * Configures the SDK. Safe to call more than once.
 *
 * Called without a user id on purpose: RevenueCat creates an anonymous app
 * user, which is what lets Restore Purchases work before sign-in — an App
 * Review requirement (CLAUDE.md §6).
 */
export function initBilling(): void {
  if (configured || !isBillingConfigurable()) {
    return;
  }

  const apiKey = Platform.OS === 'ios' ? env.revenueCat.iosKey : env.revenueCat.androidKey;

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * Links purchases to a Supabase user id after sign-in, so entitlements follow
 * the account across devices rather than the anonymous install.
 */
export async function identifyBillingUser(userId: string): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(userId);
}

/** Returns to an anonymous app user on sign-out. */
export async function resetBillingUser(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut();
}

export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    // Fail closed: the caller treats null as no entitlement (§6).
    return null;
  }
}

export function onCustomerInfoUpdate(listener: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => undefined;
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export interface PurchaseOutcome {
  customerInfo: CustomerInfo | null;
  /** True when the user dismissed the sheet. Not an error worth surfacing. */
  cancelled: boolean;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { customerInfo, cancelled: false };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'userCancelled' in error &&
      (error as { userCancelled?: boolean }).userCancelled
    ) {
      return { customerInfo: null, cancelled: true };
    }
    throw error;
  }
}

/**
 * Restore Purchases.
 *
 * Mandatory, and must work without being signed in (CLAUDE.md §6). It relies
 * only on the store account, so it is callable straight from the paywall.
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  return Purchases.restorePurchases();
}
