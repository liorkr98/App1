import type { Entitlement } from '../listings/editor.js';

/**
 * How a database read becomes an Entitlement.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. This is the single function that turns "is this person
 * allowed to publish" into the value the editor consumes. It does not
 * talk to the network; the caller does, and reports whether that talk
 * failed. Splitting it this way is what makes the fail-closed rule
 * testable without a database:
 *
 *   read failed  → 'unknown'  (never 'paid')
 *   no row       → 'unpaid'
 *   a row        → 'paid'
 *
 * There is no default, no timeout-as-paid, and no "assume true in
 * development". A missing argument is a type error, not a grant.
 * ======================================================================
 *
 * Until a PSP is signed, the row is membership of `beta_publishers`
 * (migration 0013). Swapping the source does not change this function —
 * the caller still reports a row or a failure.
 */
export function entitlementFromAllowlist(
  row: { user_id: string } | null,
  readFailed: boolean,
): Entitlement {
  if (readFailed) return 'unknown';
  return row ? 'paid' : 'unpaid';
}
