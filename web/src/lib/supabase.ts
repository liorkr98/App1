import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser's Supabase client.
 *
 * ============================ WHICH KEY THIS IS ============================
 * The PUBLISHABLE key, and it is meant to be here. It ships in the bundle,
 * every visitor can read it, and that is by design — Row Level Security is
 * what protects the data, not the secrecy of this string.
 *
 * The SERVICE ROLE key is a different thing entirely: it bypasses RLS. It
 * belongs in Fly secrets and must never appear in this file, in any PUBLIC_
 * variable, or anywhere a browser can reach (CLAUDE.md §9).
 *
 * So every table this client touches needs a policy. A table with RLS off is
 * readable by anyone who opens devtools and finds this key, which is
 * everybody.
 * ==========================================================================
 *
 * Both values come from the environment rather than the source, so the key can
 * be rotated without a code change. They are read at BUILD time — Astro inlines
 * PUBLIC_* into the bundle — which is why they are set as build variables in
 * Cloudflare and not as runtime Worker variables. A Worker serving only static
 * assets has no runtime to read them in.
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether a client can be built at all.
 *
 * A build with no variables set produces a site whose pages still work — the
 * listing pages are static and need no database. Only the signed-in surfaces
 * degrade, and they say so rather than throwing on load.
 */
export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/**
 * One client per tab, created on first use.
 *
 * Not at module scope: a module-level createClient runs during the static
 * build too, where there is no browser, no storage to persist a session in,
 * and nothing to do with the result.
 */
export function supabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set PUBLIC_SUPABASE_URL and ' +
        'PUBLIC_SUPABASE_ANON_KEY as BUILD variables — see docs/DEPLOY.md.',
    );
  }

  client ??= createClient(url, key, {
    auth: {
      // The session lives in this browser and refreshes itself. detectSession
      // is what reads the token back out of the URL after a magic link lands.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
