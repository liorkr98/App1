-- 0040: launch pricing (docs/PRICING.md, decided 12 Oct 2026).
--
-- HUMAN REVIEW, CLAUDE.md section 8. This migration decides who may publish.
--
-- What it does, in order:
--   1. billing_config, plans and cohort_counters, seeded from config/pricing.json
--      (src/features/billing/pricing.test.ts fails if the seed and the file
--      disagree).
--   2. subscriptions, purchases, payment_events (the idempotency ledger),
--      billing_events (analytics) and billing_notices (dashboard notices).
--   3. profiles.account_kind and licence_verified_at; listings.purchase_id and
--      the new status unpublished.
--   4. publish_decision(): the one place an account entitlement is read.
--   5. The publish trigger, replacing enforce_publish_grant() from 0022.
--   6. consume_cohort_seat(), apply_payment_event(), downgrade_account(),
--      admin_grant_plan(), mark_licence_verified(), record_billing_event(),
--      run_billing_daily().
--
-- Fail closed throughout: anything the decision cannot read raises, and a
-- raise is a refused publish. Drafts are never gated.
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them.

-- ---------------------------------------------------------------------------
-- 1. Configuration, plans, cohorts
-- ---------------------------------------------------------------------------

create table if not exists public.billing_config (
  id boolean primary key default true check (id),
  vat_percent numeric(5, 2) not null,
  free_page_limit integer not null check (free_page_limit >= 0),
  grace_days integer not null check (grace_days >= 0),
  lock_months integer not null check (lock_months > 0),
  notice_days integer not null check (notice_days > 0)
);

comment on table public.billing_config is
  'One row. VAT rate, free page limit, grace, price lock and notice. config/pricing.json is the source.';

insert into public.billing_config (id, vat_percent, free_page_limit, grace_days, lock_months, notice_days)
values (true, 18, 2, 7, 12, 30)
on conflict (id) do update set
  vat_percent = excluded.vat_percent,
  free_page_limit = excluded.free_page_limit,
  grace_days = excluded.grace_days,
  lock_months = excluded.lock_months,
  notice_days = excluded.notice_days;

alter table public.billing_config enable row level security;
drop policy if exists "billing_config_read" on public.billing_config;
create policy "billing_config_read" on public.billing_config
  for select to anon, authenticated using (true);

create table if not exists public.plans (
  key text primary key,
  kind text not null check (kind in ('free', 'subscription', 'one_time')),
  audience text not null check (audience in ('any', 'agent', 'office', 'dealer', 'private')),
  amount_agorot integer not null check (amount_agorot >= 0),
  vat_inclusive boolean not null,
  "interval" text check ("interval" in ('month')),
  annual_months integer check (annual_months > 0),
  page_limit integer check (page_limit >= 0),
  page_ttl_days integer check (page_ttl_days > 0),
  category text check (category in ('property', 'vehicle')),
  branding boolean not null,
  cohort text,
  regular_plan text,
  seats integer check (seats > 0),
  sort integer not null default 0,
  active boolean not null default true
);

comment on table public.plans is
  'docs/PRICING.md section 1 as rows. Amounts in agorot; B2B excludes VAT, private includes it. branding = agent branding allowed and our credit removed.';

insert into public.plans
  (key, kind, audience, amount_agorot, vat_inclusive, "interval", annual_months, page_limit, page_ttl_days, category, branding, cohort, regular_plan, seats, sort)
values
  ('free',          'free',         'any',     0,     true,  null,    null, 2,    null, null,       false, null,            null,     null, 0),
  ('agent_launch',  'subscription', 'agent',   2900,  false, 'month', null, null, null, null,       true,  'agent_launch',  'agent',  null, 1),
  ('agent',         'subscription', 'agent',   4900,  false, 'month', 10,   null, null, null,       true,  null,            null,     null, 2),
  ('office',        'subscription', 'office',  14900, false, 'month', 10,   null, null, null,       true,  null,            null,     10,   3),
  ('dealer_launch', 'subscription', 'dealer',  2900,  false, 'month', null, null, null, 'vehicle',  true,  'dealer_launch', 'dealer', null, 4),
  ('dealer',        'subscription', 'dealer',  4900,  false, 'month', 10,   null, null, 'vehicle',  true,  null,            null,     null, 5),
  ('private_sale',  'one_time',     'private', 1900,  true,  null,    null, 1,    90,   'property', false, null,            null,     null, 6),
  ('private_rent',  'one_time',     'private', 990,   true,  null,    null, 1,    60,   'property', false, null,            null,     null, 7),
  ('private_car',   'one_time',     'private', 990,   true,  null,    null, 1,    60,   'vehicle',  false, null,            null,     null, 8)
on conflict (key) do update set
  kind = excluded.kind,
  audience = excluded.audience,
  amount_agorot = excluded.amount_agorot,
  vat_inclusive = excluded.vat_inclusive,
  "interval" = excluded."interval",
  annual_months = excluded.annual_months,
  page_limit = excluded.page_limit,
  page_ttl_days = excluded.page_ttl_days,
  category = excluded.category,
  branding = excluded.branding,
  cohort = excluded.cohort,
  regular_plan = excluded.regular_plan,
  seats = excluded.seats,
  sort = excluded.sort;

alter table public.plans enable row level security;
drop policy if exists "plans_read" on public.plans;
create policy "plans_read" on public.plans
  for select to anon, authenticated using (true);

create table if not exists public.cohort_counters (
  cohort text primary key,
  used integer not null default 0 check (used >= 0),
  cap integer not null check (cap >= 0),
  constraint cohort_counters_within_cap check (used <= cap)
);

comment on table public.cohort_counters is
  'Launch seats. Incremented only by consume_cohort_seat, inside the payment transaction. Never decremented: a cancelled seat is not returned. Public, so the pricing page shows the real number.';

insert into public.cohort_counters (cohort, cap)
values ('agent_launch', 200), ('dealer_launch', 100)
on conflict (cohort) do update set cap = excluded.cap;

alter table public.cohort_counters enable row level security;
drop policy if exists "cohort_counters_read" on public.cohort_counters;
create policy "cohort_counters_read" on public.cohort_counters
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Subscriptions, purchases, the payment ledger, events, notices
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  plan_key text not null references public.plans (key),
  status text not null check (status in ('active', 'past_due', 'cancelled', 'expired')),
  source text not null default 'psp' check (source in ('psp', 'admin')),
  note text,
  granted_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  first_paid_at timestamptz,
  current_period_end timestamptz not null,
  past_due_since timestamptz,
  cancelled_at timestamptz,
  price_locked_until timestamptz,
  launch_cohort boolean not null default false,
  lock_notice_sent_at timestamptz,
  psp_customer_ref text,
  -- A token reference only, never card data (docs/adr/0003).
  psp_token_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_admin_note check (source <> 'admin' or char_length(btrim(coalesce(note, ''))) >= 3)
);

create index if not exists subscriptions_account_idx on public.subscriptions (account_id, current_period_end desc);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = account_id);
drop policy if exists "subscriptions_select_admin" on public.subscriptions;
create policy "subscriptions_select_admin" on public.subscriptions
  for select to authenticated using (public.is_site_admin());

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  plan_key text not null references public.plans (key),
  -- Bound at first publish when the purchase was not made for a listing.
  listing_id uuid references public.listings (id) on delete set null,
  amount_agorot integer not null check (amount_agorot >= 0),
  paid_at timestamptz not null default now(),
  -- First publish plus the plan page_ttl_days (decided 12 Oct: the clock starts at publish).
  expires_at timestamptz,
  psp_txn_ref text unique,
  created_at timestamptz not null default now()
);

create index if not exists purchases_account_idx on public.purchases (account_id);

alter table public.purchases enable row level security;
drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select to authenticated using ((select auth.uid()) = account_id);
drop policy if exists "purchases_select_admin" on public.purchases;
create policy "purchases_select_admin" on public.purchases
  for select to authenticated using (public.is_site_admin());

create table if not exists public.payment_events (
  psp_txn_ref text primary key,
  kind text not null,
  account_id uuid references auth.users (id) on delete set null,
  plan_key text,
  outcome text,
  received_at timestamptz not null default now()
);

comment on table public.payment_events is
  'Every payment event applied, keyed by psp_txn_ref. A replay finds its row and changes nothing. No payload is stored: it can carry personal data.';

alter table public.payment_events enable row level security;
drop policy if exists "payment_events_select_admin" on public.payment_events;
create policy "payment_events_select_admin" on public.payment_events
  for select to authenticated using (public.is_site_admin());

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  account_id uuid references auth.users (id) on delete set null,
  event text not null check (event in (
    'paywall_shown', 'plan_selected', 'checkout_started', 'payment_succeeded',
    'payment_failed', 'subscription_cancelled', 'cohort_seat_consumed', 'free_limit_hit'
  )),
  plan_key text,
  account_kind text,
  source text check (source in ('email', 'referral', 'page_credit', 'organic', 'paid')),
  created_at timestamptz not null default now()
);

comment on table public.billing_events is
  'docs/PRICING.md section 7. Written by record_billing_event and the payment functions only.';

create index if not exists billing_events_event_idx on public.billing_events (event, created_at desc);

alter table public.billing_events enable row level security;
drop policy if exists "billing_events_select_admin" on public.billing_events;
create policy "billing_events_select_admin" on public.billing_events
  for select to authenticated using (public.is_site_admin());

create table if not exists public.billing_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('price_lock_ending', 'downgraded')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.billing_notices enable row level security;
drop policy if exists "billing_notices_select_own" on public.billing_notices;
create policy "billing_notices_select_own" on public.billing_notices
  for select to authenticated using ((select auth.uid()) = account_id);

-- ---------------------------------------------------------------------------
-- 3. Columns on profiles and listings
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists account_kind text
    check (account_kind in ('agent', 'office', 'dealer', 'private')),
  add column if not exists licence_verified_at timestamptz,
  add column if not exists first_touch_source text
    check (first_touch_source in ('email', 'referral', 'page_credit', 'organic', 'paid'));

comment on column public.profiles.licence_verified_at is
  'Set only by mark_licence_verified (service role, after the register check). A person cannot set it.';

alter table public.listings
  add column if not exists purchase_id uuid references public.purchases (id) on delete set null;

comment on column public.listings.purchase_id is
  'The one-time purchase this page was published under. With expires_at in the past the page answers 410.';

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('draft', 'published', 'sold', 'archived', 'unpublished'));

-- A person may not set the columns billing owns. Our own functions set
-- billing.trusted for their transaction; nothing else can.
create or replace function public.protect_profile_billing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('billing.trusted', true) is distinct from '1' then
    if tg_op = 'INSERT' then
      new.licence_verified_at := null;
    else
      new.licence_verified_at := old.licence_verified_at;
      -- A changed licence number is a new claim: it must be checked again.
      if new.licence_number is distinct from old.licence_number then
        new.licence_verified_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing();

-- ---------------------------------------------------------------------------
-- 4. The decision
-- ---------------------------------------------------------------------------

-- The account live subscription, if any, under the grace and period rules.
create or replace function public.live_subscription(p_account uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.subscriptions s, public.billing_config c
  where s.account_id = p_account
    and (
      (s.status = 'active' and s.current_period_end > now())
      or (s.status = 'cancelled' and s.current_period_end > now())
      or (s.status = 'past_due'
          and s.past_due_since is not null
          and s.past_due_since > now() - pg_catalog.make_interval(days => c.grace_days))
    )
  order by s.current_period_end desc
  limit 1;
$$;

revoke all on function public.live_subscription(uuid) from public, anon, authenticated;

create or replace function public.has_live_admin_comp(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Honoured as an agent plan until its window closes (decided 12 Oct).
  -- No longer decremented.
  select exists (
    select 1 from public.listing_grants g
    where g.user_id = p_account
      and g.remaining > 0
      and g.effective_from <= now()
      and (g.effective_to is null or g.effective_to > now())
  );
$$;

revoke all on function public.has_live_admin_comp(uuid) from public, anon, authenticated;

-- What happens if this account publishes this listing now.
--   allowed       may it go live
--   reason        why not, a key the editor maps to Hebrew (locales)
--   credit        whether our credit shows (true = נבנה עם עמוד מכירה)
--   purchase_id   the one-time purchase it consumes, if any
--   ttl_days      that purchase page lifetime
create or replace function public.publish_decision(
  p_account uuid,
  p_listing uuid,
  p_category text
)
returns table (allowed boolean, reason text, credit boolean, purchase_id uuid, ttl_days integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sub public.subscriptions;
  plan public.plans;
  cfg public.billing_config;
  bound public.purchases;
  used integer;
begin
  if p_account is null or p_category is null then
    raise exception 'publish_unknown' using errcode = 'PT402';
  end if;

  select * into strict cfg from public.billing_config;

  sub := public.live_subscription(p_account);
  if sub.id is not null then
    select * into strict plan from public.plans where key = sub.plan_key;
    if plan.category is null or plan.category = p_category then
      return query select true, null::text, not plan.branding, null::uuid, null::integer;
      return;
    end if;
  end if;

  if public.has_live_admin_comp(p_account) then
    return query select true, null::text, false, null::uuid, null::integer;
    return;
  end if;

  -- A purchase already bound to this listing and still running, or the
  -- oldest unused purchase for its category.
  select pu.* into bound
  from public.purchases pu
  join public.plans pl on pl.key = pu.plan_key
  where pu.account_id = p_account
    and pl.kind = 'one_time'
    and pl.category = p_category
    and (
      (pu.listing_id = p_listing and (pu.expires_at is null or pu.expires_at > now()))
      or pu.listing_id is null
    )
  order by (pu.listing_id = p_listing) desc nulls last, pu.paid_at
  limit 1;

  if bound.id is not null then
    select * into strict plan from public.plans where key = bound.plan_key;
    return query select true, null::text, true, bound.id, plan.page_ttl_days;
    return;
  end if;

  -- Free: published or sold pages count (decided 12 Oct). Pages living on a
  -- purchase of their own do not use a free slot.
  select count(*)::integer into used
  from public.listings l
  where l.owner_id = p_account
    and l.status in ('published', 'sold')
    and l.id is distinct from p_listing
    and l.purchase_id is null;

  if used < cfg.free_page_limit then
    return query select true, null::text, true, null::uuid, null::integer;
    return;
  end if;

  return query select false, 'free_limit'::text, true, null::uuid, null::integer;
end;
$$;

comment on function public.publish_decision(uuid, uuid, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. The one place entitlement is read. Raises when it cannot decide.';

revoke all on function public.publish_decision(uuid, uuid, text) from public, anon, authenticated;

-- The editor asks the same question before it shows the publish button. UX
-- only: the trigger below decides.
create or replace function public.my_publish_decision(p_listing uuid, p_category text)
returns table (allowed boolean, reason text, credit boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.allowed, d.reason, d.credit
  from public.publish_decision((select auth.uid()), p_listing, p_category) d;
$$;

revoke all on function public.my_publish_decision(uuid, text) from public, anon;
grant execute on function public.my_publish_decision(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The publish trigger (replaces enforce_publish_grant from 0016 and 0022)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_publish_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  going_live boolean;
  -- Never set reads as NULL, and NULL must mean NOT trusted (a test caught
  -- this failing open).
  trusted boolean := coalesce(pg_catalog.current_setting('billing.trusted', true) = '1', false);
  until timestamptz;
begin
  -- Columns billing owns: a person cannot write them.
  if not trusted then
    if tg_op = 'INSERT' then
      new.hyad_mark := true;
      new.purchase_id := null;
    else
      new.hyad_mark := old.hyad_mark;
      new.purchase_id := old.purchase_id;
      if old.purchase_id is not null then
        new.expires_at := old.expires_at;
      end if;
    end if;
  end if;

  going_live := new.status in ('published', 'sold')
    and (tg_op = 'INSERT' or old.status not in ('published', 'sold'));

  if not going_live or trusted then
    return new;
  end if;

  select * into d from public.publish_decision(new.owner_id, new.id, new.category);

  if d.allowed is distinct from true then
    -- PT402: PostgREST answers HTTP 402, and the editor opens the paywall.
    raise exception '%', coalesce(d.reason, 'publish_unknown') using errcode = 'PT402';
  end if;

  new.hyad_mark := d.credit;

  if d.purchase_id is not null then
    update public.purchases pu
    set listing_id = new.id,
        expires_at = coalesce(pu.expires_at, now() + pg_catalog.make_interval(days => d.ttl_days))
    where pu.id = d.purchase_id
    returning pu.expires_at into until;
    new.purchase_id := d.purchase_id;
    new.expires_at := until;
  else
    new.purchase_id := null;
  end if;

  return new;
end;
$$;

comment on function public.enforce_publish_plan() is
  'HUMAN REVIEW, CLAUDE.md section 8. The law: a listing goes live only when publish_decision allows it. Raises PT402 otherwise.';

drop trigger if exists listings_enforce_publish_grant on public.listings;
drop trigger if exists listings_enforce_publish_plan on public.listings;
create trigger listings_enforce_publish_plan
  before insert or update on public.listings
  for each row execute function public.enforce_publish_plan();

-- 0022 stripped the credit when a grant arrived. Grants no longer decide
-- branding on their own; admin_grant_plan and apply_payment_event do.
drop trigger if exists listing_grants_strip_hyad_mark on public.listing_grants;

-- ---------------------------------------------------------------------------
-- 6. Payments, cohorts, downgrade, admin, events
-- ---------------------------------------------------------------------------

-- One launch seat, or none. The row lock in the update makes it race-safe:
-- two payments for the last seat serialise, and the second finds it full.
create or replace function public.consume_cohort_seat(p_cohort text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
begin
  update public.cohort_counters
  set used = used + 1
  where cohort = p_cohort and used < cap
  returning used into taken;
  return taken is not null;
end;
$$;

revoke all on function public.consume_cohort_seat(text) from public, anon, authenticated;

-- Back on a live plan: the credit follows the plan, and unpublished pages the
-- plan covers go back up (a dealer plan does not republish a flat).
create or replace function public.restore_account(p_account uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
begin
  select * into strict plan from public.plans where key = p_plan;
  perform pg_catalog.set_config('billing.trusted', '1', true);
  update public.listings
  set hyad_mark = not plan.branding
  where owner_id = p_account
    and status in ('published', 'sold')
    and purchase_id is null
    and (plan.category is null or category = plan.category);
  update public.listings
  set status = 'published', hyad_mark = not plan.branding
  where owner_id = p_account
    and status = 'unpublished'
    and (plan.category is null or category = plan.category);
  perform pg_catalog.set_config('billing.trusted', '0', true);
end;
$$;

revoke all on function public.restore_account(uuid, text) from public, anon, authenticated;

-- docs/PRICING.md section 3: back to free. The credit returns, the 2 most
-- recent pages stay, the rest become unpublished (never deleted). Pages on a
-- purchase of their own are left alone.
create or replace function public.downgrade_account(p_account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep integer;
  moved integer;
begin
  if (public.live_subscription(p_account)).id is not null then
    return 0;
  end if;
  if public.has_live_admin_comp(p_account) then
    return 0;
  end if;

  select free_page_limit into strict keep from public.billing_config;

  perform pg_catalog.set_config('billing.trusted', '1', true);

  update public.listings
  set hyad_mark = true
  where owner_id = p_account and purchase_id is null;

  with ranked as (
    select l.id, row_number() over (order by l.published_at desc nulls last, l.updated_at desc) as n
    from public.listings l
    where l.owner_id = p_account
      and l.status in ('published', 'sold')
      and l.purchase_id is null
  )
  update public.listings l
  set status = 'unpublished'
  from ranked r
  where l.id = r.id and r.n > keep;
  get diagnostics moved = row_count;

  insert into public.billing_notices (account_id, kind) values (p_account, 'downgraded');

  perform pg_catalog.set_config('billing.trusted', '0', true);
  return moved;
end;
$$;

revoke all on function public.downgrade_account(uuid) from public, anon, authenticated;

create or replace function public.account_kind_of(p_account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.account_kind from public.profiles p where p.id = p_account;
$$;

revoke all on function public.account_kind_of(uuid) from public, anon, authenticated;

-- The payment webhook, after the provider adapter verified it. The ONLY
-- writer of payment state. Idempotent on psp_txn_ref: a replay changes
-- nothing and returns duplicate.
--
-- p_kind: subscription_paid | subscription_failed | subscription_cancelled | one_time_paid
create or replace function public.apply_payment_event(
  p_txn_ref text,
  p_kind text,
  p_account uuid,
  p_plan text,
  p_listing uuid default null,
  p_amount_agorot integer default null,
  p_source text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  cfg public.billing_config;
  sub public.subscriptions;
  prior public.subscriptions;
  effective_plan text;
  launch boolean := false;
  lock_until timestamptz;
  kind_of text;
begin
  if p_txn_ref is null or btrim(p_txn_ref) = '' then
    raise exception 'txn_ref_required' using errcode = '22023';
  end if;
  if p_kind not in ('subscription_paid', 'subscription_failed', 'subscription_cancelled', 'one_time_paid') then
    raise exception 'unknown_kind' using errcode = '22023';
  end if;

  insert into public.payment_events (psp_txn_ref, kind, account_id, plan_key)
  values (p_txn_ref, p_kind, p_account, p_plan)
  on conflict (psp_txn_ref) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into strict cfg from public.billing_config;
  select * into plan from public.plans where key = p_plan;
  if plan.key is null then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  kind_of := public.account_kind_of(p_account);

  if p_kind = 'one_time_paid' then
    if plan.kind <> 'one_time' then
      raise exception 'not_one_time' using errcode = '22023';
    end if;
    insert into public.purchases (account_id, plan_key, listing_id, amount_agorot, psp_txn_ref)
    values (p_account, plan.key, p_listing, coalesce(p_amount_agorot, plan.amount_agorot), p_txn_ref);
    insert into public.billing_events (account_id, event, plan_key, account_kind, source)
    values (p_account, 'payment_succeeded', plan.key, kind_of, p_source);
    update public.payment_events set outcome = 'purchase' where psp_txn_ref = p_txn_ref;
    return 'purchase';
  end if;

  if plan.kind <> 'subscription' then
    raise exception 'not_subscription' using errcode = '22023';
  end if;

  select * into sub
  from public.subscriptions s
  where s.account_id = p_account and s.status <> 'expired'
  order by s.current_period_end desc
  limit 1;

  if p_kind = 'subscription_failed' then
    if sub.id is not null then
      update public.subscriptions
      set status = 'past_due', past_due_since = coalesce(past_due_since, now()), updated_at = now()
      where id = sub.id;
    end if;
    insert into public.billing_events (account_id, event, plan_key, account_kind, source)
    values (p_account, 'payment_failed', coalesce(sub.plan_key, plan.key), kind_of, p_source);
    update public.payment_events set outcome = 'past_due' where psp_txn_ref = p_txn_ref;
    return 'past_due';
  end if;

  if p_kind = 'subscription_cancelled' then
    if sub.id is not null then
      -- Effective at period end: pages stay as they are until then.
      update public.subscriptions
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = sub.id;
    end if;
    insert into public.billing_events (account_id, event, plan_key, account_kind, source)
    values (p_account, 'subscription_cancelled', coalesce(sub.plan_key, plan.key), kind_of, p_source);
    update public.payment_events set outcome = 'cancelled' where psp_txn_ref = p_txn_ref;
    return 'cancelled';
  end if;

  -- subscription_paid
  if sub.id is not null and sub.status in ('active', 'past_due') then
    -- A renewal. The plan stays what it is (a launch plan stays launch until
    -- its lock ends, see run_billing_daily).
    update public.subscriptions
    set status = 'active',
        past_due_since = null,
        current_period_end = greatest(current_period_end, now()) + interval '1 month',
        first_paid_at = coalesce(first_paid_at, now()),
        updated_at = now()
    where id = sub.id;
    effective_plan := sub.plan_key;
  else
    effective_plan := plan.key;
    if plan.cohort is not null then
      -- A launch member returning within 12 months of their first payment
      -- gets the launch price back without a new seat.
      select * into prior
      from public.subscriptions s
      where s.account_id = p_account and s.launch_cohort
      order by s.first_paid_at desc nulls last
      limit 1;

      if prior.id is not null and prior.price_locked_until is not null and prior.price_locked_until > now() then
        launch := true;
        lock_until := prior.price_locked_until;
      elsif public.consume_cohort_seat(plan.cohort) then
        launch := true;
        lock_until := now() + pg_catalog.make_interval(months => cfg.lock_months);
        insert into public.billing_events (account_id, event, plan_key, account_kind, source)
        values (p_account, 'cohort_seat_consumed', plan.key, kind_of, p_source);
      else
        -- The cohort is full: the 201st agent pays the regular plan.
        effective_plan := plan.regular_plan;
      end if;
    end if;

    insert into public.subscriptions
      (account_id, plan_key, status, source, first_paid_at, current_period_end, price_locked_until, launch_cohort)
    values
      (p_account, effective_plan, 'active', 'psp', now(), now() + interval '1 month',
       case when launch then lock_until end, launch);
  end if;

  perform public.restore_account(p_account, effective_plan);

  insert into public.billing_events (account_id, event, plan_key, account_kind, source)
  values (p_account, 'payment_succeeded', effective_plan, kind_of, p_source);
  update public.payment_events set outcome = effective_plan, plan_key = effective_plan where psp_txn_ref = p_txn_ref;
  return effective_plan;
end;
$$;

comment on function public.apply_payment_event(text, text, uuid, text, uuid, integer, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. Service role only, called by /api/payments/webhook after the adapter verified the event. Idempotent on psp_txn_ref.';

revoke all on function public.apply_payment_event(text, text, uuid, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text, text, uuid, text, uuid, integer, text) to service_role;

-- Until a PSP is signed: a plan by hand, with a required note.
create or replace function public.admin_grant_plan(
  p_user_id uuid,
  p_plan text,
  p_until timestamptz,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  sub_id uuid;
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user required' using errcode = '22023';
  end if;
  select * into plan from public.plans where key = p_plan and kind = 'subscription';
  if plan.key is null then
    raise exception 'subscription plan required' using errcode = '22023';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'until must be in the future' using errcode = '22023';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;

  insert into public.subscriptions
    (account_id, plan_key, status, source, note, granted_by, current_period_end)
  values
    (p_user_id, plan.key, 'active', 'admin', btrim(p_note), (select auth.uid()), p_until)
  returning id into sub_id;

  perform public.restore_account(p_user_id, plan.key);
  return sub_id;
end;
$$;

comment on function public.admin_grant_plan(uuid, text, timestamptz, text) is
  'Admin-only plan grant until a date, with a required note. Does not touch cohort seats.';

revoke all on function public.admin_grant_plan(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.admin_grant_plan(uuid, text, timestamptz, text) to authenticated;

-- The licence check passed (web/src/pages/api/licence-check.ts, service role).
create or replace function public.mark_licence_verified(p_user_id uuid, p_licence text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('billing.trusted', '1', true);
  update public.profiles
  set licence_number = btrim(p_licence), licence_verified_at = now()
  where id = p_user_id;
  perform pg_catalog.set_config('billing.trusted', '0', true);
end;
$$;

revoke all on function public.mark_licence_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_licence_verified(uuid, text) to service_role;

-- Analytics from the browser. Server-side events are written by the
-- functions above. Only the client-side events are accepted here.
create or replace function public.record_billing_event(
  p_event text,
  p_plan text default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event not in ('paywall_shown', 'plan_selected', 'checkout_started', 'free_limit_hit') then
    raise exception 'event not accepted from a browser' using errcode = '22023';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where key = p_plan) then
    p_plan := null;
  end if;
  if p_source is not null and p_source not in ('email', 'referral', 'page_credit', 'organic', 'paid') then
    p_source := null;
  end if;
  insert into public.billing_events (account_id, event, plan_key, account_kind, source)
  values ((select auth.uid()), p_event, p_plan, public.account_kind_of((select auth.uid())), p_source);
end;
$$;

revoke all on function public.record_billing_event(text, text, text) from public;
grant execute on function public.record_billing_event(text, text, text) to anon, authenticated;

create or replace function public.mark_billing_notice_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.billing_notices set read_at = now()
  where id = p_id and account_id = (select auth.uid());
$$;

revoke all on function public.mark_billing_notice_read(uuid) from public, anon;
grant execute on function public.mark_billing_notice_read(uuid) to authenticated;

-- Once a day. The publish decision reads time itself, so nothing is granted
-- or refused by this job being late; it does the side effects:
--   1. the 30-day notice before a launch price lock ends (dashboard; email
--      needs a sending service, docs/PRICING.md);
--   2. a lock that ended moves the subscription to the regular plan;
--   3. past due beyond the grace, or cancelled past its period: expired and
--      downgraded.
create or replace function public.run_billing_daily()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.billing_config;
  r record;
  notices integer := 0;
  moved integer := 0;
  downgraded integer := 0;
begin
  select * into strict cfg from public.billing_config;

  for r in
    select s.id, s.account_id, s.price_locked_until
    from public.subscriptions s
    where s.launch_cohort
      and s.status in ('active', 'past_due', 'cancelled')
      and s.lock_notice_sent_at is null
      and s.price_locked_until is not null
      and s.price_locked_until - pg_catalog.make_interval(days => cfg.notice_days) <= now()
      and s.price_locked_until > now()
  loop
    insert into public.billing_notices (account_id, kind, due_at)
    values (r.account_id, 'price_lock_ending', r.price_locked_until);
    update public.subscriptions set lock_notice_sent_at = now(), updated_at = now() where id = r.id;
    notices := notices + 1;
  end loop;

  update public.subscriptions s
  set plan_key = p.regular_plan, updated_at = now()
  from public.plans p
  where p.key = s.plan_key
    and p.regular_plan is not null
    and s.price_locked_until is not null
    and s.price_locked_until <= now()
    and s.status <> 'expired';
  get diagnostics moved = row_count;

  for r in
    select s.id, s.account_id
    from public.subscriptions s
    where (s.status = 'past_due' and s.past_due_since <= now() - pg_catalog.make_interval(days => cfg.grace_days))
       or (s.status = 'cancelled' and s.current_period_end <= now())
       or (s.status = 'active' and s.current_period_end <= now() - pg_catalog.make_interval(days => cfg.grace_days))
  loop
    update public.subscriptions set status = 'expired', updated_at = now() where id = r.id;
    perform public.downgrade_account(r.account_id);
    downgraded := downgraded + 1;
  end loop;

  return jsonb_build_object('notices', notices, 'moved_to_regular', moved, 'downgraded', downgraded);
end;
$$;

revoke all on function public.run_billing_daily() from public, anon, authenticated;

-- Scheduled where pg_cron is enabled (Database, Extensions, pg_cron). Without
-- it, docs/PRICING-OPS.md says how to run the job.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule('billing-daily', '17 3 * * *', 'select public.run_billing_daily()');
  end if;
end;
$$;

-- The old trigger function is kept, unused, so a rollback is a trigger swap.
comment on function public.enforce_publish_grant() is
  'Retired by 0040 (enforce_publish_plan). Kept so a rollback is one create trigger.';
