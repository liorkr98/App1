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
 *   read failed     → 'unknown'  (never 'paid', never 'free')
 *   live grant      → 'paid'
 *   no grant, 0 published (count succeeded) → 'free'
 *   no grant, already published → 'unpaid'
 *   published-count failed → 'unknown'
 *
 * There is no default, no timeout-as-paid, and no "assume true in
 * development". A missing argument is a type error, not a grant.
 * ======================================================================
 *
 * A grant with remaining 0, a window that has not started, or a window
 * that has ended, is not live. Admin comps and (later) PSP rows share
 * this shape so a failed webhook cannot invent a paid state.
 * ======================================================================
 *
 * The source is `listing_grants` (migration 0016). `beta_publishers` is
 * kept as a historical table; new reads do not use it.
 */

export interface GrantRow {
  remaining: number;
  effective_from: string;
  effective_to: string | null;
}

/**
 * @deprecated Use entitlementFromGrants. Kept so existing tests and any
 * leftover caller that still reads beta_publishers fail closed the same way.
 */
export function entitlementFromAllowlist(
  row: { user_id: string } | null,
  readFailed: boolean,
): Entitlement {
  if (readFailed) return 'unknown';
  return row ? 'paid' : 'unpaid';
}

export function entitlementFromGrants(
  rows: readonly GrantRow[] | null,
  readFailed: boolean,
  now: Date = new Date(),
  publishedCount: number | null = 0,
): Entitlement {
  if (readFailed) return 'unknown';
  if (publishedCount === null) return 'unknown';

  const ts = now.getTime();
  const live = (rows ?? []).some((row) => {
    if (!Number.isFinite(row.remaining) || row.remaining <= 0) return false;
    const from = Date.parse(row.effective_from);
    if (!Number.isFinite(from) || from > ts) return false;
    if (row.effective_to) {
      const to = Date.parse(row.effective_to);
      if (!Number.isFinite(to) || to <= ts) return false;
    }
    return true;
  });

  if (live) return 'paid';
  if (publishedCount === 0) return 'free';
  return 'unpaid';
}
