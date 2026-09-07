import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * ============================================================================
 * PER-APP IDENTITY — the only block the clone script rewrites (Stage 7).
 * ============================================================================
 *
 * Everything below this block is shared across the portfolio and should not
 * need editing per app. Keeping identity in one object is what makes cloning
 * the template cheap.
 *
 * Version and buildNumber are set by a human, never by tooling
 * (CLAUDE.md §9).
 */
const identity = {
  name: 'Hebrew App Template',
  slug: 'app1',
  owner: 'liorkrisis-team',
  scheme: 'hebrewapptemplate',
  bundleIdentifier: 'com.template.hebrewapp',
  androidPackage: 'com.template.hebrewapp',
  version: '1.0.0',
  easProjectId: '259e2af8-8519-4257-a321-e377944580b1',

  /** Compliance surfaces. All three are App Review requirements (§7). */
  privacyPolicyUrl: 'https://example.com/he/privacy',
  termsOfServiceUrl: 'https://example.com/he/terms',
  supportEmail: 'support@example.com',

  /** RevenueCat entitlement. One per app (§6). */
  entitlementId: 'pro',

  splashBackgroundColor: '#FFFFFF',
} as const;

// ============================================================================
// Shared configuration below.
// ============================================================================

/** Redacted app data types, all collected only for app functionality. */
const collected = (type: string, linked: boolean) => ({
  NSPrivacyCollectedDataType: type,
  NSPrivacyCollectedDataTypeLinked: linked,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
});

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: identity.name,
  slug: identity.slug,
  owner: identity.owner,
  scheme: identity.scheme,
  version: identity.version,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  ios: {
    supportsTablet: false,
    bundleIdentifier: identity.bundleIdentifier,
    usesAppleSignIn: true,
    privacyManifests: {
      // No tracking, so no ATT prompt (CLAUDE.md §7). Turning this on is a
      // deliberate decision that must come with the prompt and the domains.
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        collected('NSPrivacyCollectedDataTypeEmailAddress', true),
        collected('NSPrivacyCollectedDataTypeUserID', true),
        collected('NSPrivacyCollectedDataTypeCrashData', false),
        collected('NSPrivacyCollectedDataTypePurchaseHistory', true),
      ],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
    },
  },

  android: {
    package: identity.androidPackage,
    edgeToEdgeEnabled: true,
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    // forcesRTL writes the RTL flags natively at build time, so the very first
    // frame is right-to-left — no reload, no flash (CLAUDE.md §4.5).
    ['expo-localization', { supportsRTL: true, forcesRTL: true }],
    ['expo-splash-screen', { backgroundColor: identity.splashBackgroundColor }],
    // Uploads source maps on EAS builds. Org and project come from the EAS
    // environment; SENTRY_AUTH_TOKEN is an EAS secret, never in the bundle.
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG ?? '',
        project: process.env.SENTRY_PROJECT ?? '',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    eas: { projectId: identity.easProjectId },
    // Read at runtime by src/core/config/app.ts, so the compliance URLs have
    // exactly one definition.
    appConfig: {
      privacyPolicyUrl: identity.privacyPolicyUrl,
      termsOfServiceUrl: identity.termsOfServiceUrl,
      supportEmail: identity.supportEmail,
      entitlementId: identity.entitlementId,
    },
  },
});
