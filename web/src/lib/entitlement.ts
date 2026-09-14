import type { Entitlement } from '@/features/listings/editor';
import { entitlementFromAllowlist } from '@/features/billing/entitlement';

import { supabase, supabaseConfigured } from './supabase';

/**
 * The editor's entitlement read.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. This is the one place the web app decides whether a signed-in
 * agent may publish. It does not invent a 'paid' on timeout, on a missing
 * table, or on a thrown error.
 *
 * Until a PSP is signed (ADR 0003), the source is `beta_publishers` — a table
 * with no client write policy. A row appears only when a human inserts one.
 * ======================================================================
 */
export async function loadEntitlement(): Promise<Entitlement> {
  if (!supabaseConfigured) return 'unknown';

  try {
    const client = supabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session) return 'unpaid';

    const { data, error } = await client.from('beta_publishers').select('user_id').maybeSingle();

    if (error) return entitlementFromAllowlist(null, true);

    const row = data && typeof data === 'object' && 'user_id' in data
      ? { user_id: String((data as { user_id: unknown }).user_id) }
      : null;

    return entitlementFromAllowlist(row, false);
  } catch {
    return 'unknown';
  }
}
