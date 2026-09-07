import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from '@/core/config/env';
import type { Database } from '@/types/database';

import { secureStorageAdapter } from './storage';

/**
 * The typed Supabase client.
 *
 * Generic over Database (src/types/database.ts), so a typo in a table or
 * column name is a compile error rather than a runtime 400.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabase.url,
  env.supabase.anonKey,
  {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar, so there is no OAuth fragment to parse.
      // Leaving this on makes the client wait for a redirect that never comes.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Refresh the session only while the app is in the foreground.
 *
 * Supabase's timer keeps firing in the background otherwise, which burns
 * battery and can wake the app to fail a request with no network. Called once
 * from the root layout.
 */
export function startSupabaseAutoRefresh(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });

  void supabase.auth.startAutoRefresh();

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}
