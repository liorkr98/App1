import { env } from 'cloudflare:workers';

import type { TranzilaConfig } from '@/features/billing/tranzila';
import { cleanSecret } from '@/features/listings/phone-portal';

/**
 * Tranzila's settings from the Worker (cloudflare.d.ts). SERVER ONLY: this
 * reads secrets through `cloudflare:workers`, which a page script cannot
 * import. Undefined unless every one is set — the payment routes then answer
 * "not set up" and nothing is charged or confirmed.
 */
export function tranzilaEnv(): { config: TranzilaConfig; tokenKey: string } | undefined {
  const terminal = cleanSecret(env.TRANZILA_TERMINAL);
  const appKey = cleanSecret(env.TRANZILA_APP_KEY);
  const secret = cleanSecret(env.TRANZILA_SECRET);
  const tokenKey = cleanSecret(env.PAYMENT_TOKEN_KEY);
  if (!terminal || !/^[A-Za-z0-9_-]{2,40}$/.test(terminal) || !appKey || !secret || !tokenKey) return undefined;
  return { config: { terminal, appKey, secret }, tokenKey };
}
