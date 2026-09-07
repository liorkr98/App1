import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/core/auth/AuthProvider';
import { useAuthGuard } from '@/core/auth/guard';
import '@/core/i18n/i18n';
import { initRTL } from '@/core/i18n/rtl';
import { queryClient, startQueryFocusTracking } from '@/core/query/client';
import { useAppFonts } from '@/core/ui';

/**
 * Root layout.
 *
 * Order matters here. RTL is forced at module scope, before React renders its
 * first frame — doing it inside a component would lay the first frame out
 * left-to-right and then visibly flip it.
 *
 * Stage 6 wraps this with Sentry and the root error boundary.
 */

initRTL();

// Hold the splash screen until Assistant has loaded, otherwise the first frame
// renders Hebrew in the system font and then reflows.
void SplashScreen.preventAutoHideAsync();

/**
 * Split out so the guard runs inside AuthProvider — it reads auth status, and
 * a hook cannot consume a context its own component provides.
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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
