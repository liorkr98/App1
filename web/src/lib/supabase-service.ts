import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

import { supabaseUrl } from './supabase';

/**
 * The SERVICE-ROLE client. It bypasses Row Level Security.
 *
 * SERVER ONLY. It reads a Worker secret through `cloudflare:workers`, which
 * cannot be bundled into a page script — importing this from client code
 * fails the build, which is the guard (CLAUDE.md §9).
 *
 *   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
 *
 * One caller, /api/phone-upload, and only AFTER it has matched a portal
 * token to an open portal: a phone that is not signed in has no session for
 * RLS to read, so the token check is the authorisation and this client does
 * the write the token allows. Undefined when the secret is not set — the
 * route then answers 503 and the editor says the phone upload is not set up.
 */
export function supabaseService(): SupabaseClient | undefined {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !supabaseUrl) return undefined;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
