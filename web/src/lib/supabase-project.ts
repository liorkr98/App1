/*
 * The project's URL and publishable key, alone, so that a page which only
 * needs to know WHICH project (lib/session-hint.ts) does not import
 * @supabase/supabase-js to find out (16 Oct 2026: 210 KB on every site page).
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

export const url = import.meta.env.PUBLIC_SUPABASE_URL || PROJECT_URL;
export const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || PUBLISHABLE_KEY;
