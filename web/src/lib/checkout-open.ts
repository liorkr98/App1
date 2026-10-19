import { bearer } from './billing-event-plain';
import { key, url } from './supabase-project';

/**
 * Whether this visitor may open a payment window (0049): payments_mode is
 * live, or test and they are a site admin. Without the Supabase client, so
 * /pricing stays light. Anything unreadable is "no": the buttons keep
 * pointing at the contact form. It only chooses a button; the server
 * decides again (open_checkout) before any window opens.
 */
export async function checkoutOpen(): Promise<boolean> {
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/rest/v1/billing_config?select=payments_mode`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const rows = (await response.json()) as { payments_mode?: unknown }[];
    const mode = Array.isArray(rows) ? rows[0]?.payments_mode : undefined;
    if (mode === 'live') return true;
    if (mode !== 'test') return false;
    const token = bearer();
    if (token === key) return false;
    const admin = await fetch(`${url}/rest/v1/rpc/is_site_admin`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    return (await admin.json()) === true;
  } catch {
    return false;
  }
}
