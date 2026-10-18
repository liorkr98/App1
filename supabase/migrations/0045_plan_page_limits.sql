-- 0045: agent plans sold by active pages (decided 18 Oct 2026).
--
-- HUMAN REVIEW, CLAUDE.md section 8. This migration decides who may publish.
--
-- The owner: 5 active pages for 29, 10 for 49, unlimited for 79 (a month,
-- before VAT). The launch price (first 200, 29, locked for 12 months) is
-- now the 10-page plan at the launch price. Office stays unlimited. Car
-- dealers buy the same plans under the same names, with no broker licence
-- asked of anyone, and share the one launch pool of 200; the dealer plans
-- are retired (section 1).
--
-- What it does:
--   1. Seeds every plan again (src/features/billing/pricing-config.ts is the
--      source; pricing.test.ts reads the latest seed and fails on a mismatch).
--      agent keeps its key and price and is now capped at 10; agent_basic and
--      agent_unlimited are new. Anyone already on agent by hand drops from
--      unlimited to 10: an admin moves them with admin_grant_plan.
--   2. publish_decision(): a live subscription whose plan has a page_limit
--      allows a publish only while fewer pages than that are live. Counted
--      exactly like the free slots: published or sold, not this listing, not
--      a page living on a purchase of its own. At the cap it falls through to
--      the remaining routes (an admin comp still covers it) and is refused as
--      plan_limit, not free_limit, so the editor offers the next plan up.
--   3. restore_account(): a plan becoming live republishes at most its
--      page_limit, most recent first, and takes down whatever is over it (a
--      move from unlimited to 5). Taken down means unpublished, never deleted,
--      the same as downgrade_account. apply_payment_event and admin_grant_plan
--      already call it whenever a plan becomes live.
--
-- Fail closed as before: a missing config or plan raises, and a raise is a
-- refused publish. Drafts are never gated.
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them.

-- ---------------------------------------------------------------------------
-- 1. Plans
-- ---------------------------------------------------------------------------

insert into public.plans
  (key, kind, audience, amount_agorot, vat_inclusive, "interval", annual_months, page_limit, page_ttl_days, category, branding, cohort, regular_plan, seats, sort)
values
  ('free',            'free',         'any',     0,     true,  null,    null, 2,    null, null,       false, null,            null,     null, 0),
  ('agent_launch',    'subscription', 'agent',   2900,  false, 'month', null, 10,   null, null,       true,  'agent_launch',  'agent',  null, 1),
  ('agent_basic',     'subscription', 'agent',   2900,  false, 'month', 10,   5,    null, null,       true,  null,            null,     null, 2),
  ('agent',           'subscription', 'agent',   4900,  false, 'month', 10,   10,   null, null,       true,  null,            null,     null, 3),
  ('agent_unlimited', 'subscription', 'agent',   7900,  false, 'month', 10,   null, null, null,       true,  null,            null,     null, 4),
  ('office',          'subscription', 'office',  14900, false, 'month', 10,   null, null, null,       true,  null,            null,     10,   5),
  ('private_sale',    'one_time',     'private', 1900,  true,  null,    null, 1,    90,   'property', false, null,            null,     null, 6),
  ('private_rent',    'one_time',     'private', 990,   true,  null,    null, 1,    60,   'property', false, null,            null,     null, 7),
  ('private_car',     'one_time',     'private', 990,   true,  null,    null, 1,    60,   'vehicle',  false, null,            null,     null, 8)
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
  sort = excluded.sort,
  active = true;

-- Car dealers buy the agent plans (owner, 18 Oct 2026): same names, same
-- prices, one launch pool of 200. The dealer plans are retired, not deleted:
-- a subscription already on one keeps its row and keeps working (the
-- foreign key needs it). Nothing new is sold on them.
update public.plans set active = false where key in ('dealer', 'dealer_launch');

comment on column public.plans.page_limit is
  'Published or sold pages at once; null is unlimited. Read by publish_decision and restore_account (0045).';

-- ---------------------------------------------------------------------------
-- 2. The decision
-- ---------------------------------------------------------------------------

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
  capped boolean := false;
begin
  if p_account is null or p_category is null then
    raise exception 'publish_unknown' using errcode = 'PT402';
  end if;

  select * into strict cfg from public.billing_config;

  -- Live pages, counted once for every route below: published or sold (a
  -- sold page still counts), not this listing, and not a page living on a
  -- purchase of its own.
  select count(*)::integer into used
  from public.listings l
  where l.owner_id = p_account
    and l.status in ('published', 'sold')
    and l.id is distinct from p_listing
    and l.purchase_id is null;

  sub := public.live_subscription(p_account);
  if sub.id is not null then
    select * into strict plan from public.plans where key = sub.plan_key;
    if plan.category is null or plan.category = p_category then
      if plan.page_limit is null or used < plan.page_limit then
        return query select true, null::text, not plan.branding, null::uuid, null::integer;
        return;
      end if;
      capped := true;
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

  -- A capped subscriber never falls back to a free slot: their pages are
  -- already over it, and the answer they need is the next plan up.
  if capped then
    return query select false, 'plan_limit'::text, true, null::uuid, null::integer;
    return;
  end if;

  if used < cfg.free_page_limit then
    return query select true, null::text, true, null::uuid, null::integer;
    return;
  end if;

  return query select false, 'free_limit'::text, true, null::uuid, null::integer;
end;
$$;

comment on function public.publish_decision(uuid, uuid, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. The one place entitlement is read. Raises when it cannot decide. Plan page limits since 0045.';

revoke all on function public.publish_decision(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A plan becoming live: credit, republish up to the cap, trim above it
-- ---------------------------------------------------------------------------

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

  -- Live and unpublished pages the plan covers, most recent first. The
  -- first page_limit of them are up afterwards (a live one keeps its
  -- status, sold stays sold); the rest are unpublished. A purchase page and
  -- a page in another category are left alone.
  with ranked as (
    select l.id,
           l.status,
           row_number() over (
             order by (l.status in ('published', 'sold')) desc,
                      l.published_at desc nulls last,
                      l.updated_at desc
           ) as n
    from public.listings l
    where l.owner_id = p_account
      and l.status in ('published', 'sold', 'unpublished')
      and l.purchase_id is null
      and (plan.category is null or l.category = plan.category)
  )
  update public.listings l
  set status = case
        when plan.page_limit is null or r.n <= plan.page_limit then
          case when r.status = 'unpublished' then 'published' else r.status end
        else 'unpublished'
      end,
      hyad_mark = not plan.branding
  from ranked r
  where l.id = r.id
    and (
      (r.status = 'unpublished' and (plan.page_limit is null or r.n <= plan.page_limit))
      or (r.status in ('published', 'sold') and plan.page_limit is not null and r.n > plan.page_limit)
    );

  perform pg_catalog.set_config('billing.trusted', '0', true);
end;
$$;

comment on function public.restore_account(uuid, text) is
  'HUMAN REVIEW, CLAUDE.md section 8. A plan became live: credit follows it, pages it covers go up to its page_limit, most recent first, and pages over it are unpublished (0045).';

revoke all on function public.restore_account(uuid, text) from public, anon, authenticated;
