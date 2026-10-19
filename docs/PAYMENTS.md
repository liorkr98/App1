# Payments — Tranzila (decided 19 Oct 2026)

The owner chose **Tranzila**, with its invoices, and to run the monthly
billing ourselves rather than through Tranzila's own billing module.
CLAUDE.md §8 governs all of it: fail closed, and every change here needs a
human review before merge.

## What is built (migration 0049, the first payment)

```
/pricing or the editor's paywall
  └─ "לתשלום" → /pay/?plan=<key>           (shown only when payments_mode allows)
       └─ POST /api/payments/checkout       signed-in caller only
            ├─ open_checkout()              amount from the plans table, session row, nonce hash
            ├─ handshake with Tranzila      locks that amount (thtk)
            └─ Tranzila's window in a frame (card typed there, never on our page)
                 ├─ notify → /api/payments/webhook   server to server
                 └─ return → /api/payments/done      through the browser
                      both: confirmPayment() → ask Tranzila → complete_checkout()
```

A payment counts only when **Tranzila, asked server to server with our API
keys**, says the transaction is approved, for the session's amount, and
carries the session's id (`checkPayment`, `src/features/billing/tranzila.ts`).
The notification is not signed, so nothing in it is believed by itself.

### The safety rules, and where each one lives

| Rule | Where |
|---|---|
| Nobody can pay until the owner switches it on | `billing_config.payments_mode`, default `off` (0049) |
| `test` lets only site admins pay | `open_checkout` |
| The amount is never taken from a browser | `checkout_amount`, `open_checkout` |
| The amount is locked at Tranzila before the window opens | handshake (`thtk`) |
| Only Tranzila's window is framed | `/pay/` checks the origin is `https://direct.tranzila.com` |
| A result is confirmed with Tranzila before anything is given | `confirmPayment` → `lookupTransaction` → `checkPayment` |
| Another customer's payment cannot be pointed at your session | the session id must be on the transaction itself; a nonce per session |
| One transaction completes one session, once | `psp_txn_ref` unique; `complete_checkout` is idempotent |
| One plan at a time; no launch price once the seats are gone | `open_checkout` |
| Card numbers never reach us | Tranzila's window (PCI SAQ-A) |
| The card token is sealed before the database sees it | AES-256-GCM with `PAYMENT_TOKEN_KEY`, bound to the account (`token-vault.ts`) |
| No browser can read a saved token, not even its owner's | `payment_methods` has no policy; `my_payment_method()` shows the last four digits |
| A token from a browser address bar is never kept | `checkPayment(…, trustHintToken=false)` on `/api/payments/done` |
| Ten payment windows in ten minutes at most | `open_checkout` |
| Nothing from a payment result is logged | `payment-confirm.ts` |

## Switching it on

1. **Run `supabase/migrations/0049_tranzila_checkout.sql`** in the SQL editor
   (Raw → copy all → a new tab → Run). Safe to run twice. Payments stay `off`.
2. **From Tranzila:** the terminal name, an API app key and secret
   (API v1), the handshake switched on for the terminal, tokens (`tranmode`
   AK) and 3-D Secure on the terminal, automatic invoices for each
   transaction, and **a test terminal**.
3. **In Cloudflare** (Workers → besivov → Settings → Variables and secrets):
   - `TRANZILA_TERMINAL` — plain text
   - `TRANZILA_APP_KEY`, `TRANZILA_SECRET` — secrets
   - `PAYMENT_TOKEN_KEY` — a secret: 32 random bytes as base64, made with
     `openssl rand -base64 32`. **Keep a copy somewhere safe**: without it
     every saved card has to be entered again.
4. **Test mode:** `update public.billing_config set payments_mode = 'test';`
   Only site admins see the pay buttons. Point the variables at the **test
   terminal** and go through the list below.
5. **Live:** the real terminal's variables, then
   `update public.billing_config set payments_mode = 'live';`
   To stop everything at once: `... set payments_mode = 'off';`

## Confirm on the test terminal before `live`

Tranzila's documentation site could not be opened from the machine this was
built on. The names below come from its official pages as quoted by search
results. Each failure mode is "the payment is not confirmed", never "a payment
is confirmed wrongly", but each must be seen working:

- [ ] Handshake: `GET https://api.tranzila.com/v1/handshake/create?supplier=&sum=` with the API headers returns a `thtk`.
- [ ] API headers: `X-tranzila-api-app-key`, `-request-time`, `-nonce`, `-access-token` = HMAC-SHA256(key = secret + time + nonce, message = app key), hex.
- [ ] The window: `https://direct.tranzila.com/<terminal>/iframenew.php` with `sum`, `currency=1`, `tranmode=AK|A`, `thtk`, `notify_url_address`, `success_url_address`, `fail_url_address`, and our `ls_session` / `ls_nonce` coming back.
- [ ] The notification arrives at `/api/payments/webhook` with `index`, `ls_session`, `ls_nonce`, `TranzilaTK`, `expmonth`, `expyear`, `ccno`.
- [ ] The lookup: `POST https://api.tranzila.com/v1/transactions` with `terminal_name` and `transaction_index` returns `transactions[]` with `index`, `processor_response_code` `000`, `amount`, and `pdesc` (which carries the session id).
- [ ] A declined card lands on "התשלום לא אושר"; an approved one on "התשלום התקבל", with the plan live in /mine.
- [ ] The invoice (חשבונית מס קבלה) reaches the payer.
- [ ] Each mismatch is refused: change the amount in the address bar; replay a notification; send another session's id.

## Not built yet (the next PR)

- The **monthly charge** of the saved token: a daily run with one charge row
  per subscription per month, written before Tranzila is called; an answer
  lost on the way is looked up, never charged again blindly; retries on day
  1, 3 and 6 inside the 7-day grace; a "card expiring" notice.
- **Cancel** and **update card** in /me.
- **Refunds**, admin only, for the 14-day cancellation right.
- Changing plan.
