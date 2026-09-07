import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * TanStack Query configuration.
 *
 * Server state lives here; Zustand is only for the rare client state Query is
 * the wrong tool for (CLAUDE.md §2).
 *
 * NOTE: this sits in src/core/query/, a folder not listed in CLAUDE.md §3.
 * It is shared infrastructure like the rest of core, but flagging it because
 * §3 is meant to be the canonical structure.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Israeli mobile networks drop out on the move. Three attempts with
      // backoff covers a tunnel; more just delays the error state.
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),

      // A minute of freshness stops every screen focus from refetching, which
      // matters on metered mobile data.
      staleTime: 60_000,
      gcTime: 5 * 60_000,

      // React Native has no window focus event; refetchOnWindowFocus relies on
      // the focusManager wiring below instead.
      refetchOnReconnect: true,
    },
    mutations: {
      // Mutations are not idempotent by default — retrying a purchase or a
      // delete is worse than surfacing the failure.
      retry: 0,
    },
  },
});

/**
 * Tells Query when the app is foregrounded, so `refetchOnWindowFocus` works.
 * Without this, data goes stale while the app is backgrounded and never
 * refreshes when the user comes back.
 */
export function startQueryFocusTracking(): () => void {
  const onChange = (state: AppStateStatus) => {
    focusManager.setFocused(state === 'active');
  };

  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}
