import { captureFirstTouch } from './first-touch';
import { supabase, supabaseConfigured } from './supabase';

/**
 * docs/PRICING.md §7: the events pricing decisions are made from.
 *
 * The browser may record only what happens in a browser — paywall_shown,
 * plan_selected, checkout_started, free_limit_hit. Payments, cancellations
 * and cohort seats are written by the database functions that cause them,
 * so a page cannot invent a sale (migration 0040, record_billing_event).
 *
 * Fire and forget: analytics never blocks or breaks a page.
 */
export type BrowserBillingEvent = 'paywall_shown' | 'plan_selected' | 'checkout_started' | 'free_limit_hit';

export async function recordBillingEvent(event: BrowserBillingEvent, planKey: string | null): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    await supabase().rpc('record_billing_event', {
      p_event: event,
      p_plan: planKey,
      p_source: captureFirstTouch(),
    });
  } catch {
    // Analytics never breaks the page.
  }
}
