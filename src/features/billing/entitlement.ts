import type { Entitlement } from '../listings/editor.js';

/**
 * How the database's publish decision becomes the editor's Entitlement.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The decision itself is `publish_decision()` in Postgres
 * (migration 0040), read through `my_publish_decision`; the same function
 * the publish trigger runs, so the editor and the gate cannot disagree
 * about the rule, only about the moment. This maps its answer and nothing
 * else, and fails closed:
 *
 *   read failed, no row, malformed row   → 'unknown'
 *   allowed, no credit (a paid plan)     → 'paid'
 *   allowed, with our credit             → 'free'  (free slot or a one-time page)
 *   not allowed                          → 'unpaid' (the paywall)
 *
 * There is no default, no timeout-as-paid, and no "assume true in
 * development". The editor's canPublish is UX; the trigger is the law.
 * ======================================================================
 */

export interface DecisionRow {
  allowed: boolean;
  reason: string | null;
  credit: boolean;
}

export function entitlementFromDecision(row: unknown, readFailed: boolean): Entitlement {
  if (readFailed || !row || typeof row !== 'object') return 'unknown';
  const { allowed, credit } = row as Partial<DecisionRow>;
  if (typeof allowed !== 'boolean' || typeof credit !== 'boolean') return 'unknown';
  if (!allowed) return 'unpaid';
  return credit ? 'free' : 'paid';
}

/**
 * The refusal the trigger raises (PT402, HTTP 402) and what the editor does
 * with it. free_limit: the free pages are in use. plan_limit: a paid plan's
 * active pages are in use (0045), so the paywall offers the next plan up.
 */
export type PublishRefusal = 'free_limit' | 'plan_limit' | 'publish_unknown';

export function publishRefusal(error: { code?: string | undefined; message?: string | undefined } | null): PublishRefusal | null {
  if (!error || error.code !== 'PT402') return null;
  return error.message === 'free_limit' || error.message === 'plan_limit' ? error.message : 'publish_unknown';
}

/** Whether a refusing decision is a paid plan at its cap. Which paywall to show; it grants nothing. */
export function decisionCapped(row: unknown): boolean {
  return typeof row === 'object' && row !== null && (row as Partial<DecisionRow>).reason === 'plan_limit';
}
