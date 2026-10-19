-- 0049: paying through Tranzila, the first payment (19 Oct 2026).
--
-- HUMAN REVIEW, CLAUDE.md section 8. This migration decides when a payment
-- may start and how a verified payment becomes a plan.
--
-- The owner chose Tranzila and to run the monthly billing ourselves. This is
-- the first step and moves no money by itself:
--   1. billing_config.payments_mode: off (the default), test (site admins
--      only, for the Tranzila test terminal) or live. The owner switches it
--      in the SQL editor; nothing in the code turns it on.
--   2. checkout_sessions: one row per payment window opened. The amount is
--      worked out HERE from the plans table, never taken from a browser.
--   3. payment_methods: the card token Tranzila returns, sealed by the
--      Worker with a key the database never sees. No policy at all: no
--      signed-in user and no visitor can read a row, not even their own.
--      my_payment_method() gives the owner the last four digits and expiry.
--   4. open_checkout() and complete_checkout(), service role only. The
--      Worker calls complete_checkout only after Tranzila itself confirmed
--      the transaction (web/src/pages/api/payments/webhook.ts); it then goes
--      through apply_payment_event (0040), idempotent on the transaction.
--
-- The monthly charge of the saved token is the next migration.
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them (src/features/migrations.test.ts).

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

alter table public.billing_config
  add column if not exists payments_mode text not null default 'off';

alter table public.billing_config drop constraint if exists billing_config_payments_mode;
alter table public.billing_config
  add constraint billing_config_payments_mode check (payments_mode in ('off', 'test', 'live'));

comment on column public.billing_config.payments_mode is
  'off: nobody can pay. test: site admins only, against the Tranzila test terminal. live: everyone. Set by hand in the SQL editor.';

-- ---------------------------------------------------------------------------
-- 2. Checkout sessions
-- ---------------------------------------------------------------------------

create table if not exists public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  plan_key text not null references public.plans (key),
  listing_id uuid references public.listings (id) on delete set null,
  amount_agorot integer not null check (amount_agorot > 0),
  -- SHA-256 of a random value the Worker put in the payment window. Tranzila
  -- sends it back with the result; a result without it is not looked at.
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'paid')),
  psp_txn_ref text unique,
  -- What apply_payment_event returned: the plan given, or purchase.
  outcome text,
  created_at timestamptz not null default now(),
  -- When the window may no longer be opened. A payment Tranzila approved
  -- after this is still honoured: the money was taken.
  expires_at timestamptz not null default now() + interval '30 minutes',
  completed_at timestamptz
);

create index if not exists checkout_sessions_account_idx on public.checkout_sessions (account_id, created_at desc);

alter table public.checkout_sessions enable row level security;
drop policy if exists "checkout_sessions_select_own" on public.checkout_sessions;
create policy "checkout_sessions_select_own" on public.checkout_sessions
  for select to authenticated using ((select auth.uid()) = account_id);
drop policy if exists "checkout_sessions_select_admin" on public.checkout_sessions;
create policy "checkout_sessions_select_admin" on public.checkout_sessions
  for select to authenticated using (public.is_site_admin());
-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
revoke insert, update, delete, truncate on public.checkout_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Saved cards: a sealed token, never a card number
-- ---------------------------------------------------------------------------

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  -- v1.<iv>.<ciphertext>: AES-256-GCM in the Worker, bound to account_id
  -- (src/features/billing/token-vault.ts). A copy of this table alone
  -- cannot charge anyone.
  token_sealed text not null check (token_sealed ~ '^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'),
  exp_month smallint check (exp_month between 1 and 12),
  exp_year smallint check (exp_year between 2000 and 2100),
  last4 text check (last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);

create unique index if not exists payment_methods_one_live on public.payment_methods (account_id) where replaced_at is null;

alter table public.payment_methods enable row level security;
-- No policy on purpose: only the service role reads or writes this table.
revoke all on public.payment_methods from anon, authenticated;

comment on table public.payment_methods is
  'HUMAN REVIEW. The Tranzila card token, sealed by the Worker. No client policy: service role only. my_payment_method() shows the owner the last four digits.';

create or replace function public.my_payment_method()
returns table (last4 text, exp_month smallint, exp_year smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.last4, m.exp_month, m.exp_year
  from public.payment_methods m
  where m.account_id = (select auth.uid()) and m.replaced_at is null;
$$;

revoke all on function public.my_payment_method() from public, anon;
grant execute on function public.my_payment_method() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Opening and completing a checkout
-- ---------------------------------------------------------------------------

-- The amount to charge for a plan, in agorot: B2B plans are priced before
-- VAT, private plans including it (docs/PRICING.md section 4).
create or replace function public.checkout_amount(p_plan text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.vat_inclusive then p.amount_agorot
              else round(p.amount_agorot * (100 + c.vat_percent) / 100)::integer end
  from public.plans p, public.billing_config c
  where p.key = p_plan;
$$;

revoke all on function public.checkout_amount(text) from public, anon, authenticated;

-- Errors, all 22023 or 42501, read by /api/payments/checkout:
--   payments_off, test_only, unknown_plan, already_subscribed, cohort_full,
--   not_your_listing, too_many.
create or replace function public.open_checkout(
  p_account uuid,
  p_plan text,
  p_listing uuid,
  p_nonce_hash text
)
returns table (session_id uuid, amount_agorot integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.billing_config;
  plan public.plans;
  counter public.cohort_counters;
  live public.subscriptions;
  amount integer;
  sid uuid;
begin
  select * into strict cfg from public.billing_config;
  if cfg.payments_mode = 'off' then
    raise exception 'payments_off' using errcode = '22023';
  end if;
  if cfg.payments_mode = 'test'
     and not exists (select 1 from public.site_admins a where a.user_id = p_account) then
    raise exception 'test_only' using errcode = '42501';
  end if;

  select * into plan from public.plans
  where key = p_plan and active and kind in ('subscription', 'one_time');
  if plan.key is null then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;

  -- Ten in ten minutes is far more than a person opening a payment window.
  if (select count(*) from public.checkout_sessions s
      where s.account_id = p_account and s.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  if plan.kind = 'subscription' then
    -- One plan at a time. Changing plan is not built yet, and a payment on
    -- top of a live plan, admin granted or paid, would be read as a renewal
    -- of that plan (apply_payment_event).
    live := public.live_subscription(p_account);
    if live.id is not null then
      raise exception 'already_subscribed' using errcode = '22023';
    end if;
    if plan.cohort is not null then
      select * into counter from public.cohort_counters where cohort = plan.cohort;
      -- A launch member returning inside their lock keeps it without a seat.
      if (counter.cohort is null or counter.used >= counter.cap)
         and not exists (
           select 1 from public.subscriptions s
           where s.account_id = p_account and s.launch_cohort and s.price_locked_until > now()) then
        raise exception 'cohort_full' using errcode = '22023';
      end if;
    end if;
    if p_listing is not null then
      raise exception 'unknown_plan' using errcode = '22023';
    end if;
  elsif p_listing is not null
        and not exists (select 1 from public.listings l where l.id = p_listing and l.owner_id = p_account) then
    raise exception 'not_your_listing' using errcode = '42501';
  end if;

  if p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad_nonce' using errcode = '22023';
  end if;

  amount := public.checkout_amount(plan.key);
  insert into public.checkout_sessions (account_id, plan_key, listing_id, amount_agorot, nonce_hash)
  values (p_account, plan.key, p_listing, amount, p_nonce_hash)
  returning id into sid;

  insert into public.billing_events (account_id, event, plan_key, account_kind)
  values (p_account, 'checkout_started', plan.key, public.account_kind_of(p_account));

  return query select sid, amount;
end;
$$;

comment on function public.open_checkout(uuid, text, uuid, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. Service role only, called by /api/payments/checkout for the signed-in caller. The amount comes from plans, never from the request.';

revoke all on function public.open_checkout(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.open_checkout(uuid, text, uuid, text) to service_role;

-- Called only after Tranzila confirmed the transaction: approved, this
-- amount, this session. Returns the outcome of apply_payment_event, or
-- duplicate when this transaction already completed this session.
create or replace function public.complete_checkout(
  p_session uuid,
  p_txn_ref text,
  p_amount_agorot integer,
  p_token_sealed text default null,
  p_exp_month integer default null,
  p_exp_year integer default null,
  p_last4 text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.checkout_sessions;
  plan public.plans;
  applied text;
begin
  if p_txn_ref is null or btrim(p_txn_ref) = '' then
    raise exception 'txn_ref_required' using errcode = '22023';
  end if;

  select * into s from public.checkout_sessions where id = p_session for update;
  if s.id is null then
    raise exception 'unknown_session' using errcode = '22023';
  end if;
  if s.status = 'paid' then
    if s.psp_txn_ref = btrim(p_txn_ref) then
      -- The return from the window can confirm first, without the token
      -- (a browser never hands us one); the notification that follows,
      -- server to server, brings it.
      if p_token_sealed is not null
         and exists (select 1 from public.plans p where p.key = s.plan_key and p.kind = 'subscription')
         and not exists (select 1 from public.payment_methods m
                         where m.account_id = s.account_id and m.replaced_at is null and m.created_at >= s.created_at) then
        update public.payment_methods set replaced_at = now()
        where account_id = s.account_id and replaced_at is null;
        insert into public.payment_methods (account_id, token_sealed, exp_month, exp_year, last4)
        values (s.account_id, p_token_sealed, p_exp_month, p_exp_year, p_last4);
      end if;
      return 'duplicate';
    end if;
    raise exception 'session_already_paid' using errcode = '22023';
  end if;
  if p_amount_agorot is distinct from s.amount_agorot then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  select * into strict plan from public.plans where key = s.plan_key;

  applied := public.apply_payment_event(
    btrim(p_txn_ref),
    case when plan.kind = 'one_time' then 'one_time_paid' else 'subscription_paid' end,
    s.account_id,
    s.plan_key,
    s.listing_id,
    s.amount_agorot,
    null
  );
  if applied = 'duplicate' then
    -- The transaction was already applied through another session.
    raise exception 'txn_already_used' using errcode = '22023';
  end if;

  if plan.kind = 'subscription' and p_token_sealed is not null then
    update public.payment_methods set replaced_at = now()
    where account_id = s.account_id and replaced_at is null;
    insert into public.payment_methods (account_id, token_sealed, exp_month, exp_year, last4)
    values (s.account_id, p_token_sealed, p_exp_month, p_exp_year, p_last4);
  end if;

  update public.checkout_sessions
  set status = 'paid', psp_txn_ref = btrim(p_txn_ref), outcome = applied, completed_at = now()
  where id = s.id;

  return applied;
end;
$$;

comment on function public.complete_checkout(uuid, text, integer, text, integer, integer, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. Service role only, after the Worker confirmed the transaction with Tranzila. Idempotent on the transaction.';

revoke all on function public.complete_checkout(uuid, text, integer, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.complete_checkout(uuid, text, integer, text, integer, integer, text) to service_role;
