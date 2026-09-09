import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.js';

/**
 * Service-role client, created lazily.
 *
 * Ingestion writes to tables that have NO client write policy at all
 * (0007_proximity.sql) — a user who could write to `places` could put anything
 * on anyone's page. So these jobs are the only writer, and they bypass RLS to
 * do it.
 */
let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
