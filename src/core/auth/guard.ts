import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from './AuthProvider';

/**
 * Route guard (CLAUDE.md §3 — routing stays thin).
 *
 * Call once from the root layout. Redirects out of the protected area when
 * signed out, and out of the auth area when signed in.
 *
 * Deliberately does nothing while status is 'loading': redirecting before the
 * persisted session has been read would bounce a returning user to the login
 * screen on every cold start.
 */

/** Route group that is reachable without a session. */
const AUTH_GROUP = '(auth)';

export function useAuthGuard(): void {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    const inAuthGroup = segments[0] === AUTH_GROUP;

    if (status === 'signedOut' && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (status === 'signedIn' && inAuthGroup) {
      router.replace('/');
    }
  }, [status, segments, router]);
}
