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
    const client = supabase();

    /*
     * The no-op this file already claimed to do, now actually done.
     *
     * `record_editor_event` is granted to `authenticated` and not to `anon`,
     * so a ping from a signed-out visitor is a 401 — one on every single
     * editor load, because the first "enter" event fires on mount, before any
     * session has been restored. `.rpc()` returns its error rather than
     * throwing, so the catch below never caught it and the failure showed up
     * only as a console error in a browser nobody was watching.
     */
    const { data: session } = await client.auth.getSession();
    if (!session.session) return;

    await client.rpc('record_editor_event', {
      p_step: step,
      p_kind: kind,
      p_listing_id: listingId ?? undefined,
    });
  } catch {
    // The form still has to move. Analytics is not the product.
  }
}
