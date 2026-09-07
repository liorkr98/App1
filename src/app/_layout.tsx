import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/core/auth/AuthProvider';
import { useAuthGuard } from '@/core/auth/guard';
import { initBilling } from '@/core/billing';
import '@/core/i18n/i18n';
import { initRTL } from '@/core/i18n/rtl';
import { RootErrorBoundary } from '@/core/observability/ErrorBoundary';
import { initSentry } from '@/core/observability/sentry';
import { queryClient, startQueryFocusTracking } from '@/core/query/client';
import { useAppFonts } from '@/core/ui';

/**
 * Root layout.
 *
 * Order matters. All three run at module scope, before React renders its first
 * frame:
 *   - Sentry first, so a crash during the rest of startup is still reported.
 *   - RTL before any layout exists, or the first frame renders left-to-right
 *     and then visibly flips.
 *   - Billing early, so Restore Purchases works on the paywall without a
 *     session (CLAUDE.md §6).
 */

initSentry();
initRTL();
initBilling();

// Hold the splash screen until Assistant has loaded, otherwise the first frame
// renders Hebrew in the system font and then reflows.
void SplashScreen.preventAutoHideAsync();

/**
 * Split out so the guard runs inside AuthProvider — a hook cannot consume a
 * context its own component provides.
 */
function RootNavigator() {
  useAuthGuard();
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => startQueryFocusTracking(), []);

  // Render nothing while fonts load. On failure we continue anyway — a system
  // font is worse than Assistant, but better than a permanently blank app.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // Outermost, so it catches render errors from every provider below it.
    <RootErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
