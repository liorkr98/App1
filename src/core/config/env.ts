/**
 * Environment configuration.
 *
 * Every value here comes from an EXPO_PUBLIC_* variable, which means every
 * value here is embedded in the client bundle and visible to anyone who
 * downloads the app (CLAUDE.md §8). Nothing secret may be added to this file.
 *
 * Values are read through explicit property access rather than a loop:
 * Expo inlines `process.env.EXPO_PUBLIC_FOO` at build time by static
 * substitution, so a dynamic lookup like `process.env[name]` resolves to
 * undefined in a release build.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    // Failing loudly at startup beats a confusing 401 later. In production
    // this is a build misconfiguration, not a user-facing error path.
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in, and set the same values as EAS environment variables for builds.`,
    );
  }
  return value;
}

export const env = {
  supabase: {
    url: required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
    anonKey: required(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  },
  revenueCat: {
    // Not required() — billing is only initialised in Stage 4, and an app
    // without subscriptions should still boot.
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  },
  sentry: {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  },
} as const;
