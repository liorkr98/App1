import { supabase, supabaseConfigured } from './supabase';

/**
 * Show the admin link only after a confirmed site-admin session.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. This reads `is_site_admin`. It does not grant listings,
 * publish, or any other entitlement. Unknown, error, or not-admin keeps
 * the control hidden (fail closed). `/admin` itself repeats the same RPC
 * and refuses the form unless it returns true.
 * ======================================================================
 */
export async function revealIfSiteAdmin(link: HTMLElement | null): Promise<void> {
  if (!link) return;
  link.hidden = true;
  if (!supabaseConfigured) return;
  const { data, error } = await supabase().rpc('is_site_admin');
  link.hidden = error !== null || data !== true;
}
