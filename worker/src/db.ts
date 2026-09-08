import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.js';

/**
 * The service-role client.
 *
 * Bypasses RLS by design — the worker has to read every user's jobs and write
 * to the `derived` bucket, neither of which any client role may do. That is
 * exactly why this key never leaves the server, and why `jobs` has no write
 * policy for `authenticated`.
 */
let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      // A server process has no user session to persist or refresh.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}
