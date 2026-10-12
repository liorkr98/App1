-- Billing tests (docs/PRICING.md section 9, CLAUDE.md section 8).
-- Each block raises on a failed expectation; run.sh stops at the first.

create schema t;

create sequence t.slug_seq;

create function t.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok  %', label;
end $$;

create function t.new_user(p_email text) returns uuid language plpgsql as $$
declare id uuid;
begin
  insert into auth.users (email) values (p_email) returning auth.users.id into id;
  insert into public.profiles (id) values (id) on conflict do nothing;
  return id;
end $$;

create function t.new_listing(p_owner uuid, p_category text) returns uuid language plpgsql as $$
declare id uuid;
begin
  insert into public.listings (owner_id, slug, category, title, price)
  values (p_owner, lpad(nextval('t.slug_seq')::text, 5, '0'), p_category, 'test', 1)
  returning public.listings.id into id;
  return id;
end $$;

-- Run a statement as a signed-in person, through RLS, like the browser does.
create function t.as_user(p_user uuid, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  execute p_sql;
  execute 'reset role';
end $$;

create function t.as_service(p_sql text) returns text language plpgsql as $$
declare result text;
begin
  execute 'set local role service_role';
  execute p_sql into result;
  execute 'reset role';
  return result;
end $$;

create function t.publish(p_user uuid, p_listing uuid) returns void language plpgsql as $$
begin
  perform t.as_user(p_user, format(
    'update public.listings set status = %L, published_at = now() where id = %L', 'published', p_listing));
end $$;

-- True when the statement fails with this SQLSTATE (and message, if given).
create function t.fails(p_user uuid, p_sql text, p_code text, p_message text default null)
returns boolean language plpgsql as $$
begin
  perform t.as_user(p_user, p_sql);
  return false;
exception when others then
  return sqlstate = p_code and (p_message is null or sqlerrm = p_message);
end $$;

create function t.status(p_listing uuid) returns text language sql as $$
  select status from public.listings where id = p_listing
$$;

create function t.credit(p_listing uuid) returns boolean language sql as $$
  select hyad_mark from public.listings where id = p_listing
$$;

create function t.pay(p_txn text, p_kind text, p_user uuid, p_plan text, p_listing uuid default null)
returns text language plpgsql as $$
begin
  return t.as_service(format(
    'select public.apply_payment_event(%L, %L, %L::uuid, %L, %L::uuid)', p_txn, p_kind, p_user, p_plan, p_listing));
end $$;

-- ---------------------------------------------------------------------------
-- Free: 2 pages, sold counts, the 3rd is refused with PT402 (HTTP 402).
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := t.new_user('a@test');
  l1 uuid := t.new_listing(a, 'property');
  l2 uuid := t.new_listing(a, 'property');
  l3 uuid := t.new_listing(a, 'vehicle');
begin
  perform t.check(t.fails(a, format('update public.listings set title = %L where id = %L', 'draft edit', l3), 'PT402') = false,
    'drafts are never gated');
  perform t.publish(a, l1);
  perform t.publish(a, l2);
  perform t.check(t.status(l1) = 'published' and t.status(l2) = 'published', 'free publishes two pages');
  perform t.check(t.credit(l1) and t.credit(l2), 'free pages carry our credit');

  perform t.check(t.fails(a, format('update public.listings set status = %L where id = %L', 'published', l3), 'PT402', 'free_limit'),
    'the 3rd free page is refused with PT402 free_limit');
  perform t.check(t.status(l3) = 'draft', 'the refused page stays a draft');

  perform t.as_user(a, format('update public.listings set status = %L where id = %L', 'sold', l2));
  perform t.check(t.fails(a, format('update public.listings set status = %L where id = %L', 'published', l3), 'PT402'),
    'a sold page still uses a free slot (decided 12 Oct)');

  perform t.as_user(a, format('update public.listings set status = %L where id = %L', 'archived', l2));
  perform t.publish(a, l3);
  perform t.check(t.status(l3) = 'published', 'archiving a page frees its slot');

  perform t.check(t.fails(a, format('insert into public.listings (owner_id, slug, category, title, price, status) values (%L, %L, %L, %L, 1, %L)',
      a, 'ZZZZZ', 'property', 'x', 'published'), 'PT402'),
    'inserting straight into published goes through the same gate');

  perform t.as_user(a, format('update public.listings set hyad_mark = false where id = %L', l1));
  perform t.check(t.credit(l1), 'a person cannot remove the credit');
end $$;

-- ---------------------------------------------------------------------------
-- Payments: launch seat, replay, credit off, unlimited, the 201st.
-- ---------------------------------------------------------------------------
do $$
declare
  b uuid := t.new_user('b@test');
  l1 uuid := t.new_listing(b, 'property');
  l2 uuid := t.new_listing(b, 'property');
  l3 uuid := t.new_listing(b, 'property');
  used_before integer;
  sub public.subscriptions;
begin
  perform t.publish(b, l1);
  perform t.publish(b, l2);
  select used into used_before from public.cohort_counters where cohort = 'agent_launch';

  perform t.check(t.pay('txn-b1', 'subscription_paid', b, 'agent_launch') = 'agent_launch', 'a first payment gets the launch plan');
  perform t.check((select used from public.cohort_counters where cohort = 'agent_launch') = used_before + 1, 'and consumes one seat');
  select * into sub from public.subscriptions where account_id = b;
  perform t.check(sub.launch_cohort and sub.price_locked_until between now() + interval '11 months 28 days' and now() + interval '12 months 1 day',
    'the launch price is locked for 12 months from the first payment');
  perform t.check(not t.credit(l1) and not t.credit(l2), 'a paid plan takes the credit off pages already published');

  perform t.check(t.pay('txn-b1', 'subscription_paid', b, 'agent_launch') = 'duplicate', 'a webhook replay is a duplicate');
  perform t.check((select used from public.cohort_counters where cohort = 'agent_launch') = used_before + 1, 'a replay does not take a second seat');
  perform t.check((select count(*) from public.subscriptions where account_id = b) = 1, 'a replay does not add a subscription');

  perform t.publish(b, l3);
  perform t.check(t.status(l3) = 'published' and not t.credit(l3), 'a subscriber publishes beyond the free limit, without the credit');

  perform t.check(t.fails(b, $q$select public.apply_payment_event('x', 'subscription_paid', auth.uid(), 'agent')$q$, '42501'),
    'a person cannot call apply_payment_event');
end $$;

do $$
declare
  c uuid := t.new_user('c@test');
  d uuid := t.new_user('d@test');
begin
  update public.cohort_counters set used = 199, cap = 200 where cohort = 'agent_launch';
  perform t.check(t.pay('txn-c1', 'subscription_paid', c, 'agent_launch') = 'agent_launch', 'the 200th payment gets the launch plan');
  perform t.check(t.pay('txn-d1', 'subscription_paid', d, 'agent_launch') = 'agent', 'the 201st payment gets the regular plan');
  perform t.check((select used from public.cohort_counters where cohort = 'agent_launch') = 200, 'the counter never passes its cap');
end $$;

-- ---------------------------------------------------------------------------
-- Failed payments: grace, then downgrade.
-- ---------------------------------------------------------------------------
do $$
declare
  e uuid := t.new_user('e@test');
  pages uuid[] := array[t.new_listing(e, 'property'), t.new_listing(e, 'property'), t.new_listing(e, 'property'), t.new_listing(e, 'property')];
  extra uuid := t.new_listing(e, 'property');
  i integer;
  moved integer;
begin
  perform t.pay('txn-e1', 'subscription_paid', e, 'agent');
  for i in 1..4 loop
    perform t.publish(e, pages[i]);
    update public.listings set published_at = now() - make_interval(days => 10 - i) where id = pages[i];
  end loop;

  perform t.pay('txn-e2', 'subscription_failed', e, 'agent');
  perform t.check((select status from public.subscriptions where account_id = e) = 'past_due', 'a failed payment is past due');
  perform t.check((select allowed from public.publish_decision(e, extra, 'property')), 'inside the 7-day grace, publishing still works');

  update public.subscriptions set past_due_since = now() - interval '8 days' where account_id = e;
  perform t.check(not (select allowed from public.publish_decision(e, extra, 'property')), 'after the grace, the free limit applies');

  perform public.run_billing_daily();
  perform t.check((select status from public.subscriptions where account_id = e) = 'expired', 'the daily job expires it');
  perform t.check(t.status(pages[4]) = 'published' and t.status(pages[3]) = 'published', 'the 2 most recent pages stay published');
  perform t.check(t.status(pages[1]) = 'unpublished' and t.status(pages[2]) = 'unpublished', 'the rest become unpublished, not deleted');
  perform t.check(t.credit(pages[4]), 'the credit comes back');
  perform t.check((select count(*) from public.billing_notices where account_id = e and kind = 'downgraded') = 1, 'a dashboard notice says so');

  perform t.check(t.fails(e, format('update public.listings set status = %L where id = %L', 'published', pages[1]), 'PT402'),
    'an unpublished page cannot be pushed back up on the free plan');

  perform t.pay('txn-e3', 'subscription_paid', e, 'agent');
  perform t.check(t.status(pages[1]) = 'published' and not t.credit(pages[1]), 're-subscribing restores the pages and the branding');
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation: effective at period end.
-- ---------------------------------------------------------------------------
do $$
declare
  f uuid := t.new_user('f@test');
  pages uuid[] := array[t.new_listing(f, 'vehicle'), t.new_listing(f, 'vehicle'), t.new_listing(f, 'vehicle')];
  i integer;
begin
  perform t.pay('txn-f1', 'subscription_paid', f, 'agent');
  for i in 1..3 loop perform t.publish(f, pages[i]); end loop;
  perform t.pay('txn-f2', 'subscription_cancelled', f, 'agent');
  perform t.check((select allowed from public.publish_decision(f, gen_random_uuid(), 'vehicle')), 'a cancelled plan works until its period ends');
  perform public.run_billing_daily();
  perform t.check(t.status(pages[1]) = 'published', 'nothing is unpublished before the period ends');

  update public.subscriptions set current_period_end = now() - interval '1 minute' where account_id = f;
  perform public.run_billing_daily();
  perform t.check((select count(*) from public.listings where owner_id = f and status = 'published') = 2,
    'after the period ends, only 2 pages remain published');
end $$;

-- ---------------------------------------------------------------------------
-- The price lock: notice 30 days before, then the regular plan.
-- ---------------------------------------------------------------------------
do $$
declare
  g uuid := t.new_user('g@test');
begin
  update public.cohort_counters set used = 0 where cohort = 'agent_launch';
  perform t.pay('txn-g1', 'subscription_paid', g, 'agent_launch');
  update public.subscriptions set price_locked_until = now() + interval '20 days' where account_id = g;
  perform public.run_billing_daily();
  perform t.check((select count(*) from public.billing_notices where account_id = g and kind = 'price_lock_ending') = 1,
    'a notice is written 30 days before the lock ends');
  perform public.run_billing_daily();
  perform t.check((select count(*) from public.billing_notices where account_id = g and kind = 'price_lock_ending') = 1,
    'and only once');

  update public.subscriptions set price_locked_until = now() - interval '1 second' where account_id = g;
  perform public.run_billing_daily();
  perform t.check((select plan_key from public.subscriptions where account_id = g) = 'agent', 'when the lock ends the plan moves to agent');

  -- A launch member who left and comes back inside the 12 months.
  update public.subscriptions set price_locked_until = now() + interval '3 months', plan_key = 'agent_launch', status = 'expired' where account_id = g;
  perform t.check(t.pay('txn-g2', 'subscription_paid', g, 'agent_launch') = 'agent_launch', 'a returning launch member gets the launch price back');
  perform t.check((select used from public.cohort_counters where cohort = 'agent_launch') = 1, 'without taking a new seat');
end $$;

-- ---------------------------------------------------------------------------
-- Private one-time pages: bound at first publish, 90 days from then.
-- ---------------------------------------------------------------------------
do $$
declare
  h uuid := t.new_user('h@test');
  l1 uuid := t.new_listing(h, 'property');
  l2 uuid := t.new_listing(h, 'property');
  l3 uuid := t.new_listing(h, 'property');
  car uuid := t.new_listing(h, 'vehicle');
  p public.purchases;
begin
  perform t.publish(h, l1);
  perform t.publish(h, l2);
  perform t.check(t.pay('txn-h1', 'one_time_paid', h, 'private_sale') = 'purchase', 'a one-time payment is a purchase');
  perform t.check((select expires_at from public.purchases where account_id = h) is null, 'its clock has not started');

  perform t.check(t.fails(h, format('update public.listings set status = %L where id = %L', 'published', car), 'PT402'),
    'a flat purchase does not publish a car');

  perform t.publish(h, l3);
  select * into p from public.purchases where account_id = h;
  perform t.check(p.listing_id = l3, 'the purchase binds to the page at first publish');
  perform t.check(p.expires_at between now() + interval '89 days 23 hours' and now() + interval '90 days 1 minute', 'and runs 90 days from then');
  perform t.check((select purchase_id from public.listings where id = l3) = p.id and t.credit(l3), 'the page carries the purchase, with our credit');
  perform t.check((select expires_at from public.listings where id = l3) = p.expires_at, 'the page expiry is the purchase expiry');

  perform t.as_user(h, format('update public.listings set expires_at = now() + interval %L where id = %L', '5 years', l3));
  perform t.check((select expires_at from public.listings where id = l3) = p.expires_at, 'a person cannot extend a paid page');
end $$;

-- ---------------------------------------------------------------------------
-- Dealer plans cover cars only. Admin comps are honoured.
-- ---------------------------------------------------------------------------
do $$
declare
  k uuid := t.new_user('k@test');
  flats uuid[] := array[t.new_listing(k, 'property'), t.new_listing(k, 'property'), t.new_listing(k, 'property')];
  m uuid := t.new_user('m@test');
  mine uuid[] := array[t.new_listing(m, 'property'), t.new_listing(m, 'property'), t.new_listing(m, 'property')];
  i integer;
begin
  perform t.pay('txn-k1', 'subscription_paid', k, 'dealer');
  perform t.publish(k, flats[1]);
  perform t.publish(k, flats[2]);
  perform t.check(t.credit(flats[1]), 'a flat published by a dealer is on the free plan, with the credit');
  perform t.check(t.fails(k, format('update public.listings set status = %L where id = %L', 'published', flats[3]), 'PT402'),
    'a dealer plan does not lift the free limit for flats');

  insert into public.listing_grants (user_id, remaining, source, note, effective_to)
  values (m, 5, 'admin_comp', 'launch partner', now() + interval '30 days');
  for i in 1..3 loop perform t.publish(m, mine[i]); end loop;
  perform t.check(t.status(mine[3]) = 'published' and not t.credit(mine[3]), 'a live admin comp publishes like an agent plan');
  perform t.check((select remaining from public.listing_grants where user_id = m) = 5, 'and is no longer decremented');
end $$;

-- ---------------------------------------------------------------------------
-- Columns and calls a person may not touch.
-- ---------------------------------------------------------------------------
do $$
declare
  n uuid := t.new_user('n@test');
begin
  perform t.as_user(n, format('update public.profiles set licence_verified_at = now(), account_kind = %L where id = %L', 'agent', n));
  perform t.check((select licence_verified_at from public.profiles where id = n) is null, 'a person cannot mark their own licence verified');
  perform t.check((select account_kind from public.profiles where id = n) = 'agent', 'but chooses their account kind');

  perform t.as_service(format('select public.mark_licence_verified(%L, %L)', n, '12345')::text || '::text');
  perform t.check((select licence_verified_at from public.profiles where id = n) is not null, 'the service role marks it after the register check');

  perform t.as_user(n, format('update public.profiles set licence_number = %L where id = %L', '99999', n));
  perform t.check((select licence_verified_at from public.profiles where id = n) is null, 'a new licence number must be checked again');

  perform t.check(t.fails(n, $q$select public.record_billing_event('payment_succeeded', 'agent', 'organic')$q$, '22023'),
    'the browser cannot record a payment');
  perform t.as_user(n, $q$select public.record_billing_event('paywall_shown', 'agent_launch', 'page_credit')$q$);
  perform t.check((select account_kind from public.billing_events where account_id = n and event = 'paywall_shown') = 'agent',
    'a browser event carries the account kind');

  perform t.check(t.fails(n, format('select public.admin_grant_plan(%L, %L, now() + interval %L, %L)', n, 'agent', '1 month', 'self grant'), '42501'),
    'a person cannot grant themselves a plan');
  perform t.check(t.fails(n, $q$select public.downgrade_account(auth.uid())$q$, '42501'), 'a person cannot call downgrade');
  perform t.check(t.fails(n, $q$insert into public.subscriptions (account_id, plan_key, status, current_period_end) values (auth.uid(), 'agent', 'active', now() + interval '1 year')$q$, '42501'),
    'a person cannot write a subscription');
end $$;
