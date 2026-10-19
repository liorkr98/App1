import type { BrowserBillingEvent } from './billing-events';
import { captureFirstTouch } from './first-touch';
import { SESSION_KEY } from './session-hint';
import { key, url } from './supabase-project';

/**
 * recordBillingEvent (billing-events.ts) without the Supabase client, for a
 * page that loads nothing else from it. /pricing carried 210 KB of script to
 * make this one call (audit, 17 Oct 2026); the homepage stopped the same way
 * on 16 Oct (session-hint.ts).
 *
 * The function attributes the row to auth.uid(), so a signed-in visitor's
 * stored access token goes with it while it is still valid. An expired one is
 * not sent: refreshing it is the client's job, and a stale token would only
 * get the call refused. The event is then recorded without an account, as for
 * a visitor who is signed out. Analytics only: nothing here grants or refuses
 * anything (CLAUDE.md §8).
 */
export function bearer(): string {
  try {
    const raw = SESSION_KEY ? localStorage.getItem(SESSION_KEY) : null;
    const stored = raw ? (JSON.parse(raw) as { access_token?: unknown; expires_at?: unknown } | null) : null;
    const token = stored?.access_token;
    const expires = Number(stored?.expires_at);
    if (typeof token === 'string' && token && Number.isFinite(expires) && expires * 1000 > Date.now() + 30_000) return token;
  } catch {
    // Unreadable storage: recorded as signed out.
  }
  return key;
}

export async function recordBillingEventPlain(event: BrowserBillingEvent, planKey: string | null): Promise<void> {
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/record_billing_event`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${bearer()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event: event, p_plan: planKey, p_source: captureFirstTouch() }),
    });
  } catch {
    // Analytics never breaks the page.
  }
}
