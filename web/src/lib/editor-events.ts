import type { Step } from '@/features/listings/editor';

import { supabase, supabaseConfigured } from './supabase';

/**
 * Funnel ping from the editor. Fail closed and silent.
 *
 * No copy, no email, no IP (CLAUDE.md §9). The RPC refuses a listing the
 * caller does not own. Signed-out sessions no-op — a bounce before sign-in
 * is not a struggle we can attribute.
 */
export async function recordEditorEvent(
  step: Step,
  kind: 'enter' | 'blocked' | 'publish_ok' | 'publish_fail',
  listingId?: string | null,
): Promise<void> {
  if (!supabaseConfigured) return;

  try {
    await supabase().rpc('record_editor_event', {
      p_step: step,
      p_kind: kind,
      p_listing_id: listingId ?? undefined,
    });
  } catch {
    // The form still has to move. Analytics is not the product.
  }
}
