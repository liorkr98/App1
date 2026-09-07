/**
 * Per-app identity and compliance configuration.
 *
 * This is the object the clone script rewrites (Stage 7) and the one
 * app.config.ts reads for name, bundle id, scheme, icon and splash. Keeping
 * every per-app value in one place is what makes cloning the template cheap.
 *
 * Nothing secret goes here — this is bundled and public (CLAUDE.md §8).
 */

export const appConfig = {
  /** Display name, in Hebrew. Shown in stores and on the device. */
  displayName: 'תבנית בסיס',

  /** RevenueCat entitlement identifier. One per app (CLAUDE.md §6). */
  entitlementId: 'pro',

  /**
   * Legal and support surfaces. All three are App Review requirements
   * (CLAUDE.md §7) — the URLs must be live and in Hebrew before submission,
   * and the support address must be read by a human.
   */
  privacyPolicyUrl: 'https://example.com/he/privacy',
  termsOfServiceUrl: 'https://example.com/he/terms',
  supportEmail: 'support@example.com',

  /** Deep links into the platform subscription management screens. */
  manageSubscriptionUrl: {
    ios: 'https://apps.apple.com/account/subscriptions',
    android: 'https://play.google.com/store/account/subscriptions',
  },
} as const;
