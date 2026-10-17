import { key, url } from './supabase-project';

/**
 * Whether this browser holds a Supabase session, read from storage alone.
 *
 * The site header only needs to choose between "כניסה לחשבון" and "המודעות
 * שלי", and to keep the owner cookie in step (owner-cookie.ts). Asking the
 * Supabase client cost 210 KB of script on every site page, the homepage
 * included, to read one localStorage entry that client itself writes:
 * `sb-<project ref>-auth-token`. This reads it directly.
 *
 * A stored refresh token counts as signed in, which is what the client would
 * say after refreshing. A token that was revoked elsewhere reads as signed in
 * until the next page that uses the client (/mine, /me, /new), which signs
 * the browser out; for a header link that is the right trade. Nothing here
 * decides access to anything.
 */
export const SESSION_KEY = (() => {
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return '';
  }
})();

export const sessionConfigured = Boolean(url && key && SESSION_KEY);

export function hasSession(): boolean {
  if (!SESSION_KEY) return false;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { refresh_token?: unknown; access_token?: unknown } | null;
    return Boolean(stored && (stored.refresh_token || stored.access_token));
  } catch {
    return false;
  }
}

/**
 * A sign-in that came back with its token in the URL. Sign-in redirects to
 * /enter/ (enter.astro), whose client reads it; but Supabase falls back to the
 * Site URL when a redirect is not on its allow-list, and a site page no longer
 * carries a client to finish the sign-in. So such a page hands the URL on.
 */
export function authInUrl(href: string): boolean {
  return /[?#&](access_token|refresh_token|code|error_description)=/.test(href);
}
