import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import '@/core/i18n/i18n';
import { initRTL } from '@/core/i18n/rtl';
import { useAppFonts } from '@/core/ui/fonts';

/**
 * Root layout.
 *
 * Order matters here. RTL is forced at module scope, before React renders its
 * first frame — doing it inside a component would lay the first frame out
 * left-to-right and then visibly flip it.
 *
 * Later stages wrap this with: theme provider (Stage 2), TanStack Query and
 * AuthProvider (Stage 3), Sentry and the root error boundary (Stage 6).
 */

initRTL();

// Hold the splash screen until Assistant has loaded, otherwise the first frame
// renders Hebrew in the system font and then reflows.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Render nothing while fonts load. On failure we continue anyway — a system
  // font is worse than Assistant, but better than a permanently blank app.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
