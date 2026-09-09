# ADR 0003 — What the payments interface needs from a PSP

Status: **open decision.** Nothing implemented, no provider chosen.
Date: September 2026

This exists to be taken to a vendor. Israeli PSP contracts run a year with an
exit penalty, so the list is written to be checked against a sales engineer's
answers **before** signing, not discovered during integration.

Candidates on the table: **PayPlus** (leaning), **Cardcom** (alternative).
Meshulam and Greeninvoice are ruled out for subscriptions — recurring-billing
support is only partial.

Stripe is excluded on principle, permanently: see CLAUDE.md §2.

---

## The requirement that decides everything

**A synchronous transaction-status endpoint is non-negotiable.**

CLAUDE.md §8 says fail closed: unknown or errored entitlement means not paid.
Publishing is gated on payment. If the only signal that a payment succeeded is
an asynchronous webhook, then at publish time we must either block waiting for
one, or grant access on unverified state. The first is a bad experience, the
second is a bug that gives the product away.

So we must be able to **ask** "is transaction X paid?" in-band and get a
truthful answer.

**A webhook-only PSP fails this list.** Ask first; it eliminates candidates
cheaply.

---

## Operations the adapter needs

| Operation | Why it exists |
|---|---|
| `createCheckout` → hosted redirect URL | We never touch card data. Takes amount, ILS, our own reference, return and cancel URLs, and an **idempotency key** |
| `getTransaction(id)` | The fail-closed check above |
| `refund(id, amount?)` | Israeli distance-selling law allows cancellation within 14 days. Partial refunds too |
| `chargeToken(token, amount)` **or** `createSubscription` / `cancelSubscription` | Depends on who owns the recurring schedule — see below |
| `getInvoice(id)` | A compliant חשבונית מס, retrievable by transaction id |

### Hosted redirect, not embedded fields

Card data never reaches our origin. That keeps PCI scope with the PSP and is
the only posture consistent with §9. A provider that only offers a
self-hosted card form is a different, much larger compliance project.

---

## The question that changes the integration shape

**Does the PSP own the recurring schedule, or do we?**

- **PSP-owned:** we need reliable renewal webhooks, and dunning is theirs.
- **Self-driven:** we need `chargeToken` plus our own scheduler, retry policy
  and dunning.

Both are workable. They are materially different amounts of work, and some
providers support only one. Ask which, explicitly — the answer decides whether
the adapter is thin or thick.

The agent tiers (₪129 and ₪249 per month, PRD §6) require full tokenisation
either way.

---

## Webhook events required

```
payment.succeeded            — including the token, if one was created
payment.failed               — with a reason code, not just a boolean
payment.refunded
payment.chargeback
subscription.renewed         — this is what extends entitlement
subscription.payment_failed  — dunning starts here
subscription.cancelled
subscription.expired
card.expiring
```

`card.expiring` is worth more than it looks. It is the difference between
prompting an agent to update their card and silently failing their renewal,
and a silent renewal failure on a subscription product is churn we caused.

## Webhook qualities — where integrations actually go wrong

- **HMAC-signed payloads**, with a documented verification recipe
- **Replay protection** — timestamp plus a tolerance window
- **Stable event ids**, so processing can be idempotent
- **A documented retry schedule**, at-least-once delivery
- **Manual replay** from a dashboard, for the day we deploy a bug
- **The sandbox emits the same events.** A sandbox that only simulates success
  is nearly useless — the failure paths are the ones worth testing

## Idempotency keys on every mutating call

This is the requirement most often missing from Israeli PSP APIs, and it is
the one whose absence hurts most: without it, a retried publish double-charges
a seller. **Check it explicitly rather than assuming it.**

---

## Commercial questions

Worth asking before signing, because the contract term makes them expensive to
discover afterwards.

- Bit — in the same checkout, or a separate flow?
- Instalments (תשלומים) — supported, and who bears the cost?
- ILS settlement to an Israeli bank account, and the settlement period
- Does the PSP issue the tax invoice, or do we need Greeninvoice or iCount
  alongside it?
- API versioning policy — how are breaking changes announced?
- Fees: per transaction, monthly, setup, and any minimum
- Contract term and exit penalty

---

## Recommendation on process, not on provider

PayPlus' **open sandbox that needs no account** is worth real money here. It is
the difference between building the adapter against something testable now and
building it blind after a year-long contract is signed.

Whichever provider is chosen, the sequence that de-risks it:

1. Implement `createCheckout` + `getTransaction` + one webhook against the
   sandbox.
2. Confirm idempotency and signature verification actually behave as
   documented.
3. Then sign.

Vendor claims could not be verified from the development machine, so
everything above is a list of questions to put to them — not a finding about
either candidate.

---

## Consequences

- The adapter interface is the seam. One provider, one adapter; nothing
  outside `src/` billing code knows the provider's name.
- Entitlement reads stay in one place and are flagged for human review on
  every change (CLAUDE.md §8).
- If the chosen PSP turns out to lack a synchronous status endpoint, publishing
  gets a queued "payment pending" state rather than a guess — and that is a
  product change, not an implementation detail.
