/**
 * Payments provider interface (ADR 0003).
 *
 * Nothing in this file talks to a vendor. The product has not chosen a PSP
 * — Stripe is excluded permanently (CLAUDE.md §2) — and until it does, the
 * only adapter is the one that refuses to guess.
 *
 * One adapter, one name, nothing outside this directory knows it. When a
 * provider is signed, the implementation lives next to this file and the
 * editor keeps reading Entitlement, not the vendor's types.
 */

export type TransactionStatus = 'paid' | 'unpaid' | 'unknown';

export interface CheckoutInput {
  /** Our own reference, typically the listing id. */
  reference: string;
  /** Integer agorot, not shekels — PSPs charge in the minor unit. */
  amountAgorot: number;
  currency: 'ILS';
  returnUrl: string;
  cancelUrl: string;
  /** Required. A retried publish must not double-charge. */
  idempotencyKey: string;
}

export interface Checkout {
  id: string;
  /** Hosted redirect. Card data never touches our origin (ADR 0003). */
  url: string;
}

/**
 * The operations the rest of the product is allowed to ask for.
 *
 * `getTransaction` is the fail-closed check: if we cannot ask "is this
 * paid?" in-band, we must not publish. A webhook-only PSP fails this list.
 */
export interface PaymentsProvider {
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  getTransaction(id: string): Promise<{ status: TransactionStatus }>;
  refund(id: string, amountAgorot?: number): Promise<void>;
}

/**
 * The adapter in force while no PSP is signed.
 *
 * ============================ HUMAN REVIEW ============================
 * Every method returns 'unknown' or throws. There is no path that reports
 * 'paid'. That is the point: an unset provider is not a free licence
 * (CLAUDE.md §8).
 * ======================================================================
 */
export const unsetProvider: PaymentsProvider = {
  async createCheckout() {
    throw new Error('payments provider is not configured');
  },
  async getTransaction() {
    return { status: 'unknown' };
  },
  async refund() {
    throw new Error('payments provider is not configured');
  },
};
