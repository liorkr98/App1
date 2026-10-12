import type { Entitlement } from '@/features/listings/editor';
import { entitlementFromDecision } from '@/features/billing/entitlement';

import { supabase, supabaseConfigured } from './supabase';

/**
 * The editor's entitlement read.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The web app does not decide whether a signed-in person may
 * publish: it asks the database the same question the publish trigger asks
 * (`my_publish_decision`, migration 0040), for this listing and category —
 * a dealer plan covers cars, not flats, and a one-time purchase covers its
 * own category. It does not invent a 'paid' on timeout, on a missing
 * function, or on a thrown error: every failure is 'unknown', and the
 * trigger is the gate regardless.
 * ======================================================================
 */
export async function loadEntitlement(
  listingId: string | null,
  category: 'property' | 'vehicle' | undefined,
): Promise<Entitlement> {
  if (!supabaseConfigured || !category) return 'unknown';

  try {
    const client = supabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session) return 'unpaid';

    const { data, error } = await client.rpc('my_publish_decision', {
      p_listing: listingId,
      p_category: category,
    });
    const row: unknown = Array.isArray(data) ? data[0] : data;
    return entitlementFromDecision(row, Boolean(error));
  } catch {
    return 'unknown';
  }
}
