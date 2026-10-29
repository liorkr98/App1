# PRICING.md — Launch pricing and entitlements

Status: **decided (launch)**. Owner: Lior. Last updated: 2026-10-18 (agent plans by active pages).
This file is the single source of truth for plans, prices and limits.
Code reads prices from config/DB — **never hardcode a price in a component.**

---

## 1. Plans

| Plan key | Who | Price | Billing | Pages | Branding |
|---|---|---|---|---|---|
| `free` | Anyone | ₪0 | — | **2 active** published pages | Our credit "נבנה ב…" shown; no agent branding |
| `agent_basic` | Agent or car dealer | ₪29/mo + מע״מ | Monthly; annual = 10× monthly | **5 active** | Agent branding, credit removed |
| `agent` | Agent or car dealer | ₪49/mo + מע״מ | Monthly; annual = 10× monthly | **10 active** | Agent branding, credit removed |
| `agent_unlimited` | Agent or car dealer | ₪79/mo + מע״מ | Monthly; annual = 10× monthly | Unlimited | Agent branding, credit removed |
| `agent_launch` | Agent or car dealer, first 200 paying | **₪29/mo + מע״מ** | Monthly, cancel anytime | **10 active** (the `agent` plan at the launch price) | Agent branding, credit removed |
| `office` | Brokerage office, up to 10 seats | ₪149/mo + מע״מ | Monthly; annual = 10× monthly | Unlimited, shared | Office + agent branding |
| `private_sale` | Private apartment seller | **₪19 incl. VAT** | One-time | 1 page, live 90 days | Our credit shown |
| `private_rent` | Private landlord | **₪9.90 incl. VAT** | One-time | 1 page, live 60 days | Our credit shown |
| `private_car` | Private car seller | **₪9.90 incl. VAT** | One-time | 1 page, live 60 days | Our credit shown |

### One set of plans for agents and car dealers (decided 18 Oct 2026)
- Car dealers buy the same plans as agents, under the same names (בסיס, מקצועי, בלי הגבלה) and at the same prices. `dealer` and `dealer_launch` are retired in 0045 (`active = false`, rows kept for any subscription already on one).
- **No plan needs a broker licence.** The register check only decides whether a page shows "מתווך מורשה".
- One launch pool: the first 200 subscribers, agents and dealers alike. The `dealer_launch` counter is left as it was, unused.

### Agent plans by active pages (decided 18 Oct 2026)
- Agents choose by how many pages are **live at once**: 5, 10 or unlimited. "Active" is counted the same way as the free limit: published or sold, not a page living on a one-time purchase of its own. Archiving one frees its slot. Drafts never count.
- At the cap, publishing is refused as `plan_limit` and the editor offers the plans with more pages. An admin comp still covers it.
- When a plan with fewer pages becomes live (unlimited → 5, or re-subscribing after a downgrade), the most recent pages up to the cap are published and the rest are `unpublished`, never deleted. Moving back up republishes them, most recent first.
- `agent` kept its key: anyone given `agent` by hand before 18 Oct moved from unlimited to 10. An admin moves them with `admin_grant_plan(…, 'agent_unlimited', …)`.
- The pricing page shows the three side by side with 10 recommended, and what one active page costs on the capped two. All three are real plans; none is there to make another look good (docs/AGENT-TOOLS.md).
- While launch seats remain, the 10-page plan at ₪29 costs the same as the 5-page plan. That is the launch price doing what it says, not a decoy, and it ends when the cohort fills.
- Enforced in `publish_decision()` and `restore_account()`, migration 0045. The seed there is the current one (0040 holds the first).

### Launch-price rules
- `agent_launch` is a **cohort**, not coupons. A seat is consumed when the first payment succeeds.
- Seat cap: 200, agents and dealers together (until 18 Oct: 200 agents, 100 dealers). Count only successful first payments. Store the cap in config.
- Launch price is **locked for 12 months** from the first payment (`price_locked_until`). After that the subscription moves to the regular plan. Send notice **30 days before** the change, by email and in the dashboard.
- If a launch subscriber cancels, the seat is **not** returned to the pool.
- When a cap is reached, the pricing page shows the regular price automatically. No deploy needed.

## 2. Entitlement rules (server-side, fail closed)
- **All limits are enforced on the server** (publish endpoint and RLS), never only in the UI.
- The publish check reads the account's **current** entitlement at request time. Unknown plan, expired, or payment-failed means **deny publish** with a clear Hebrew message.
- Free tier: publishing a 3rd active page is blocked, and the paywall opens with `agent_launch` preselected while seats remain.
- Drafts and previews are unlimited on every plan. Only **publish** is gated.
- Private one-time pages: when `expires_at` passes, the page returns HTTP 410 with a "המודעה הסתיימה" page set to noindex. Extension = new purchase.

## 3. Cancellation and failed payments
- Cancel anytime from the dashboard, effective at period end. No phone call needed.
- After cancellation or 7 days of failed payment, the account becomes `free`. **Existing pages stay live**, but agent/dealer branding is replaced with our credit, and only the 2 most recent stay published. The rest go to `unpublished`, not deleted.
- Re-subscribing restores branding and republishes. A launch-cohort member who returns within 12 months gets the launch price back.

## 4. VAT and price display
- B2B plans (`agent*`, `office`) are displayed as **"₪29 לחודש + מע״מ"**.
- Private plans are displayed **including VAT** (consumer law), e.g. **"₪19 כולל מע״מ"**.
- Store all amounts in **agorot (integers)**, with `vat_inclusive: boolean` per price. VAT rate comes from config (currently 18%), never inline.
- Invoice/receipt is issued by the payment provider. The business entity is Lior's חברה בע״מ.

## 5. Data model (suggested)
```sql
plans (key text pk, kind text check (kind in ('subscription','one_time')),
       amount_agorot int, vat_inclusive bool, interval text null,
       page_limit int null, page_ttl_days int null, branding bool, cohort_cap int null, active bool)
subscriptions (id uuid pk, account_id uuid, plan_key text, status text,
       started_at timestamptz, current_period_end timestamptz,
       price_locked_until timestamptz null, launch_cohort bool default false,
       psp_customer_ref text, psp_token_ref text)   -- token ref only, never card data
purchases (id uuid pk, account_id uuid, plan_key text, listing_id uuid,
       amount_agorot int, paid_at timestamptz, expires_at timestamptz, psp_txn_ref text)
cohort_counters (cohort text pk, used int, cap int)  -- increment in the same transaction as payment confirmation
```
- The PSP is behind the existing payment adapter (Israeli provider; **never Stripe**). Webhooks are the source of truth for payment state. Make them idempotent on `psp_txn_ref`.

## 6. Pricing page copy (Hebrew)
- Headline: **"דף נכס שמוכר, מ-₪29 לחודש"** (the lowest agent plan; until 18 Oct it was "₪29 לחודש, בלי הגבלה")
- Sub: "2 דפים חינם לתמיד. מחיר השקה ל-200 המתווכים הראשונים, נעול ל-12 חודשים."
- Remaining-seats counter: show only real numbers from `cohort_counters`. **Never fake scarcity.**
- Private: "מוכרים לבד? דף אחד ב-₪19 כולל מע״מ."

## 7. Analytics events (required for pricing decisions)
`paywall_shown`, `plan_selected`, `checkout_started`, `payment_succeeded`, `payment_failed`, `subscription_cancelled`, `cohort_seat_consumed`, `free_limit_hit`.
Each event carries `plan_key`, `account_kind` (agent/office/dealer/private) and `source` (email/referral/page_credit/organic/paid).

## 8. Why these numbers (context, not instructions)
- Reference prices: Dira IL ₪60/mo for a solo agent (CRM + property link). MyPropertyPages $39.99/mo for unlimited pages. ₪29 makes us the cheapest paid option in Israel.
- Forecast (base scenario, `forecast-listing-pages.xlsx`), with conversion **unchanged**: year-2 revenue is about ₪73k at these prices vs about ₪185k at ₪79/₪99. **The low price pays off only if conversion and referrals roughly double.** Measure `free_limit_hit → payment_succeeded` in the first 60 days. If conversion has not risen meaningfully, the regular price takes effect after the cohort fills, as planned.

## 9. Acceptance tests
- [ ] Free account cannot publish a 3rd page (API returns 402/403; UI shows paywall).
- [x] `agent_basic` cannot publish a 6th page, `agent` an 11th; `agent_unlimited` is not capped; a move down keeps the most recent pages (scripts/sql-test/plan-limits.sql).
- [ ] 201st agent payment gets `agent`, not `agent_launch`; counter is race-safe under concurrent payments.
- [ ] `price_locked_until` transition moves the plan and sends the 30-day notice.
- [ ] Cancel → pages stay live with our credit; only 2 remain published.
- [ ] Private page returns 410 after `expires_at`.
- [ ] B2B prices render "+ מע״מ" and private prices render "כולל מע״מ"; all numbers in `<bdi>`.
- [ ] Webhook replay does not double-charge or double-count a cohort seat.
- [ ] No price literal exists in `src/` outside the config/DB loader (grep check in CI).