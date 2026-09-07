import { Stack } from 'expo-router';

/**
 * Root layout.
 *
 * Deliberately bare for Stage 0. Later stages wrap this with, in order:
 *   Stage 1 — the RTL bootstrap and the i18next provider
 *   Stage 2 — theme/token provider
 *   Stage 3 — TanStack Query client and AuthProvider
 *   Stage 6 — Sentry and the root error boundary
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
