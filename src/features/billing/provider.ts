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
  /** Which adapter this is, for /admin and logs. */
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  getTransaction(id: string): Promise<{ status: TransactionStatus }>;
  refund(id: string, amountAgorot?: number): Promise<void>;
  /**
   * The webhook, verified by the provider's own signature scheme, as one of
   * our events — or null when it is not genuine. Only a verified event ever
   * reaches `apply_payment_event` (migration 0040).
   */
  verifyWebhook(request: Request): Promise<PaymentEvent | null>;
}

/** One verified payment event, as `apply_payment_event` takes it (migration 0040). */
export interface PaymentEvent {
  /** The provider's transaction id. The idempotency key: a replay is a no-op. */
  txnRef: string;
  kind: 'subscription_paid' | 'subscription_failed' | 'subscription_cancelled' | 'one_time_paid';
  accountId: string;
  planKey: string;
  listingId?: string;
  amountAgorot?: number;
  source?: string;
}

const KINDS = new Set<PaymentEvent['kind']>(['subscription_paid', 'subscription_failed', 'subscription_cancelled', 'one_time_paid']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The shape check every adapter runs on what it verified, so a provider
 * quirk cannot pass a malformed event to the database. Null on anything
 * missing or odd: an event we cannot read is not applied.
 */
export function asPaymentEvent(value: unknown): PaymentEvent | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.txnRef !== 'string' || v.txnRef.trim() === '' || v.txnRef.length > 200) return null;
  if (typeof v.kind !== 'string' || !KINDS.has(v.kind as PaymentEvent['kind'])) return null;
  if (typeof v.accountId !== 'string' || !UUID.test(v.accountId)) return null;
  if (typeof v.planKey !== 'string' || !/^[a-z_]{2,40}$/.test(v.planKey)) return null;
  if (v.listingId !== undefined && (typeof v.listingId !== 'string' || !UUID.test(v.listingId))) return null;
  if (v.amountAgorot !== undefined && (typeof v.amountAgorot !== 'number' || !Number.isInteger(v.amountAgorot) || v.amountAgorot < 0)) return null;
  return {
    txnRef: v.txnRef.trim(),
    kind: v.kind as PaymentEvent['kind'],
    accountId: v.accountId,
    planKey: v.planKey,
    ...(typeof v.listingId === 'string' ? { listingId: v.listingId } : {}),
    ...(typeof v.amountAgorot === 'number' ? { amountAgorot: v.amountAgorot } : {}),
    ...(typeof v.source === 'string' ? { source: v.source } : {}),
  };
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
  name: 'unset',
  async createCheckout() {
    throw new Error('payments provider is not configured');
  },
  async getTransaction() {
    return { status: 'unknown' };
  },
  async refund() {
    throw new Error('payments provider is not configured');
  },
  async verifyWebhook() {
    // Nothing is genuine while no provider is signed.
    return null;
  },
};

/**
 * The adapter in force. One line changes when a PSP is signed (never
 * Stripe, CLAUDE.md §2); until then every webhook is refused.
 */
export function activeProvider(): PaymentsProvider {
  return unsetProvider;
}
