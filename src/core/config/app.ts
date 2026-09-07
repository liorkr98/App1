import Constants from 'expo-constants';

/**
 * Per-app configuration, read at runtime from app.config.ts.
 *
 * app.config.ts is the single source: the clone script rewrites its identity
 * block and both the native build and this module follow. Duplicating these
 * values here would let them drift, and a stale privacy-policy URL is an App
 * Review rejection.
 *
 * Nothing secret goes here — `extra` is bundled and public (CLAUDE.md §8).
 */

interface AppConfigExtra {
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  supportEmail: string;
  entitlementId: string;
}

const extra = (Constants.expoConfig?.extra?.appConfig ?? {}) as Partial<AppConfigExtra>;

export const appConfig = {
  /** Display name, from app.config.ts. */
  displayName: Constants.expoConfig?.name ?? '',

  /** RevenueCat entitlement identifier. One per app (CLAUDE.md §6). */
  entitlementId: extra.entitlementId ?? 'pro',

  privacyPolicyUrl: extra.privacyPolicyUrl ?? '',
  termsOfServiceUrl: extra.termsOfServiceUrl ?? '',
  supportEmail: extra.supportEmail ?? '',

  /** Deep links into the platform subscription management screens. */
  manageSubscriptionUrl: {
    ios: 'https://apps.apple.com/account/subscriptions',
    android: 'https://play.google.com/store/account/subscriptions',
  },
} as const;
