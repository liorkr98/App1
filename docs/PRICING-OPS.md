# Running pricing (migration 0040, 12 Oct 2026)

`docs/PRICING.md` is what the product charges. This is how it runs, and
what is still yours to switch on. CLAUDE.md §8 covers who may publish.

## Before the PR that adds it is merged

1. **Run `supabase/migrations/0040_pricing.sql`** in the Supabase SQL editor.
   It is safe to run twice. The editor's publish check and the new profile
   fields read from it, so **run it first, then merge**. If the code goes out
   first, publishing reads "could not check" for everyone until the migration
   runs. Nothing is published wrongly in that window: the old trigger still
   applies.
2. **Turn on pg_cron** (Database → Extensions → pg_cron), then run the
   migration's last block again, or this one line:
   `select cron.schedule('billing-daily', '17 3 * * *', 'select public.run_billing_daily()');`
   The daily job sends the 30-day lock notice, moves a finished lock to the
   regular price, and downgrades lapsed accounts. **Publishing does not
   depend on it**: the publish decision reads the clock itself.
3. **Set `BROKER_REGISTER_RESOURCE_ID`** (Worker → Settings → Variables, plain
   text). It is the data.gov.il resource id of the Justice Ministry broker
   register (פנקס המתווכים). Until it is set, every licence check answers
   "could not check", and agent and office plans stay closed to new sign-ups.
   Free and private plans are unaffected.

## What changes for people already publishing

- **Admin comps in `listing_grants` are honoured** as an agent plan until
  their `effective_to`, and are no longer counted down. A comp with no end
  date never switches over. Close it with `effective_to` when you want it to.
- **Nothing already published goes offline.** The free limit (2 pages,
  published or sold) applies to the next publish, not to pages already live.
- **"The first listing is free" is gone.** It is now 2 pages, forever.

## Granting a plan by hand (until a PSP is signed)

`/admin` → find the person by email → "מתן מסלול": a subscription plan, an
end date, and a required note. It takes the credit off their pages and
brings back anything unpublished. **It does not take a launch seat:** seats
are only for paid first payments.

## What is not built yet

- **Checkout.** Buttons are disabled with a note until a PSP is signed (ADR
  0003, never Stripe). The webhook (`/api/payments/webhook`) answers 503 to
  everything until then. When a provider is chosen, its adapter goes next to
  `src/features/billing/provider.ts` and `activeProvider()` returns it.
- **Office seats.** The `office` plan exists, but there is no place yet to
  add 10 agents to one office. Until then, grant each agent the plan.
- **Email.** The lock notice is written to the dashboard only. Email needs a
  sending service.
- **Annual billing** (10× monthly) is in the price list; the checkout that
  would offer it does not exist yet.

## Checking it

`bash scripts/sql-test/run.sh` runs the gate on a throwaway Postgres 16 (CI
runs it on every push): the free limit, sold pages, the 201st payment,
concurrent payments for the last seat, webhook replays, grace, downgrade,
cancellation, the lock notice, private-page expiry, dealer limits, admin
comps, and the columns a person must not be able to write.
