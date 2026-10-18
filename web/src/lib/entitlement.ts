import type { Entitlement } from '@/features/listings/editor';
import { decisionCapped, entitlementFromDecision } from '@/features/billing/entitlement';

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
 *
 * `capped` says only WHICH paywall to show when refused: a paid plan at its
 * active-page limit (0045) is offered the next plan up instead of the free
 * one. It never makes anything publishable.
 * ======================================================================
 */
export interface EntitlementRead {
  entitlement: Entitlement;
  capped: boolean;
}

export async function loadEntitlement(
  listingId: string | null,
  category: 'property' | 'vehicle' | undefined,
): Promise<EntitlementRead> {
  if (!supabaseConfigured || !category) return { entitlement: 'unknown', capped: false };

  try {
    const client = supabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session) return { entitlement: 'unpaid', capped: false };

    const { data, error } = await client.rpc('my_publish_decision', {
      p_listing: listingId,
      p_category: category,
    });
    const row: unknown = Array.isArray(data) ? data[0] : data;
    return { entitlement: entitlementFromDecision(row, Boolean(error)), capped: !error && decisionCapped(row) };
  } catch {
    return { entitlement: 'unknown', capped: false };
  }
}
