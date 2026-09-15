import type { Entitlement } from '@/features/listings/editor';
import { entitlementFromGrants, type GrantRow } from '@/features/billing/entitlement';

import { supabase, supabaseConfigured } from './supabase';

/**
 * The editor's entitlement read.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. This is the one place the web app decides whether a signed-in
 * agent may publish. It does not invent a 'paid' on timeout, on a missing
 * table, or on a thrown error.
 *
 * Source: `listing_grants` (migration 0016). A live row with remaining > 0
 * inside its window is 'paid'. The publish trigger is the server-side gate;
 * this read is so the editor can explain the paywall before the agent hits it.
 * ======================================================================
 */
export async function loadEntitlement(): Promise<Entitlement> {
  if (!supabaseConfigured) return 'unknown';

  try {
    const client = supabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session) return 'unpaid';

    const { data, error } = await client
      .from('listing_grants')
      .select('remaining, effective_from, effective_to');

    if (error) return entitlementFromGrants(null, true);

    const rows: GrantRow[] = (data ?? []).flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const remaining = Number((row as { remaining?: unknown }).remaining);
      const effective_from = (row as { effective_from?: unknown }).effective_from;
      const effective_to = (row as { effective_to?: unknown }).effective_to;
      if (!Number.isFinite(remaining) || typeof effective_from !== 'string') return [];
      return [
        {
          remaining,
          effective_from,
          effective_to: typeof effective_to === 'string' ? effective_to : null,
        },
      ];
    });

    return entitlementFromGrants(rows, false);
  } catch {
    return 'unknown';
  }
}
