import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { key, url } from './supabase-project';

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
 *
 * The values themselves, and why they are committed, are in
 * supabase-project.ts.
 */

/**
 * Whether a client can be built at all.
 *
 * A build with no variables set produces a site whose pages still work — the
 * listing pages are static and need no database. Only the signed-in surfaces
 * degrade, and they say so rather than throwing on load.
 */
export const supabaseConfigured = Boolean(url && key);

/** Public project values. Safe to ship; RLS is the security. */
export const supabaseUrl = url;
export const supabaseKey = key;
export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = key;

/**
 * A client with no session, for server reads of published pages.
 *
 * The browser client persists a session in localStorage. That storage does
 * not exist on a Worker, and a listing page opened from WhatsApp has no
 * account anyway. Public rows are readable under `listings_select_public`.
 */
export function supabasePublic(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set PUBLIC_SUPABASE_URL and ' +
        'PUBLIC_SUPABASE_ANON_KEY as BUILD variables — see docs/DEPLOY.md.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * A client that acts AS the signed-in agent, for a server route.
 *
 * The access token comes from the request's Authorization header, so every
 * read and write still runs under that user's RLS policies — an agent can
 * only reach their own draft, and the route needs no service-role key to be
 * useful. That is the point: the key that bypasses RLS never has to exist in
 * the Worker at all (CLAUDE.md §9).
 */
export function supabaseAsUser(accessToken: string): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set PUBLIC_SUPABASE_URL and ' +
        'PUBLIC_SUPABASE_ANON_KEY as BUILD variables — see docs/DEPLOY.md.',
    );
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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
