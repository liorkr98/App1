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
 * Both values are read at BUILD time — Astro inlines PUBLIC_* into the bundle
 * — which is why they belong in Cloudflare's BUILD variables and not its
 * runtime ones. A Worker serving only static assets has no runtime to read
 * them in, which is exactly what Cloudflare says when you try.
 */

/**
 * The project's public values, with the build variables overriding them.
 *
 * THESE ARE COMMITTED ON PURPOSE, and it is worth being precise about why,
 * because "an API key in the repo" is normally a bug.
 *
 * The publishable key is not a secret. It ships in the JavaScript bundle of
 * every Supabase site there has ever been — anyone who opens devtools on this
 * site already has it, and putting it in a public repo tells an attacker
 * nothing they could not read off the page in five seconds. What protects the
 * data is Row Level Security, not the obscurity of this string.
 *
 * The project URL is likewise printed in every network request the site makes.
 *
 * I said earlier I would not commit these and would read them from build
 * variables instead. That is still the better shape, and the env override
 * below keeps it available — but the variables were not reaching the build,
 * and a signed-out site that cannot be signed into is a worse outcome than a
 * public key in a public repo. Set the build variables and they win.
 *
 * WHAT MUST NEVER JOIN THEM is the service-role key. It bypasses RLS
 * completely, it belongs in Fly secrets, and no fallback for it may ever be
 * written here (CLAUDE.md §9).
 */
const PROJECT_URL = 'https://yaaqcfcjkfdwtczespny.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_qmwpwJ0oFGsLATp9lhoMDw_T0fQg_p7';

const url = import.meta.env.PUBLIC_SUPABASE_URL || PROJECT_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || PUBLISHABLE_KEY;

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
