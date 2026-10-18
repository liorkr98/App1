-- Agent plans by active pages (0045, decided 18 Oct 2026, CLAUDE.md section 8).
-- Runs after tests.sql, so the t.* helpers exist.

-- ---------------------------------------------------------------------------
-- 5 pages: the 6th is refused as plan_limit, sold counts, archiving frees one.
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := t.new_user('cap5@test');
  pages uuid[] := array[]::uuid[];
  sixth uuid;
  i integer;
  d record;
begin
  for i in 1..6 loop pages := pages || t.new_listing(u, 'property'); end loop;
  perform t.check(t.pay('txn-cap5', 'subscription_paid', u, 'agent_basic') = 'agent_basic', 'agent_basic is a plan you can pay for');

  for i in 1..5 loop perform t.publish(u, pages[i]); end loop;
  perform t.check((select count(*) from public.listings where owner_id = u and status = 'published') = 5, 'agent_basic publishes five pages');
  perform t.check(not t.credit(pages[5]), 'without our credit');

  sixth := pages[6];
  perform t.check(t.fails(u, format('update public.listings set status = %L where id = %L', 'published', sixth), 'PT402', 'plan_limit'),
    'the 6th page is refused with PT402 plan_limit');
  select * into d from public.publish_decision(u, sixth, 'property');
  perform t.check(d.allowed = false and d.reason = 'plan_limit', 'the editor reads plan_limit, not free_limit');

  perform t.as_user(u, format('update public.listings set status = %L where id = %L', 'sold', pages[1]));
  perform t.check(t.fails(u, format('update public.listings set status = %L where id = %L', 'published', sixth), 'PT402', 'plan_limit'),
    'a sold page still counts against the plan');

  perform t.as_user(u, format('update public.listings set status = %L where id = %L', 'archived', pages[1]));
  perform t.publish(u, sixth);
  perform t.check(t.status(sixth) = 'published', 'archiving a page frees its slot');

  perform t.check((select allowed from public.publish_decision(u, pages[5], 'property')),
    'a page already live does not count against itself');
end $$;

-- ---------------------------------------------------------------------------
-- 10 pages (the regular agent plan and the launch plan), and unlimited.
-- ---------------------------------------------------------------------------
do $$
declare
  ten uuid := t.new_user('cap10@test');
  many uuid := t.new_user('capmany@test');
  i integer;
begin
  perform t.pay('txn-cap10', 'subscription_paid', ten, 'agent');
  for i in 1..10 loop perform t.publish(ten, t.new_listing(ten, 'property')); end loop;
  perform t.check(t.fails(ten, format('update public.listings set status = %L where id = %L', 'published', t.new_listing(ten, 'vehicle')), 'PT402', 'plan_limit'),
    'the regular agent plan stops at 10, cars included');

  perform t.check(
    (select page_limit from public.plans where key = 'agent_launch') = (select page_limit from public.plans where key = 'agent'),
    'the launch plan has the same 10 pages as the plan it becomes');

  perform t.pay('txn-capmany', 'subscription_paid', many, 'agent_unlimited');
  for i in 1..15 loop perform t.publish(many, t.new_listing(many, 'property')); end loop;
  perform t.check((select count(*) from public.listings where owner_id = many and status = 'published') = 15,
    'agent_unlimited is not capped');
end $$;

-- ---------------------------------------------------------------------------
-- An admin comp still covers a capped subscriber; a capped subscriber never
-- falls back to a free slot.
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := t.new_user('capcomp@test');
  i integer;
  extra uuid;
begin
  perform t.pay('txn-capcomp', 'subscription_paid', u, 'agent_basic');
  for i in 1..5 loop perform t.publish(u, t.new_listing(u, 'property')); end loop;
  extra := t.new_listing(u, 'property');
  perform t.check((select reason from public.publish_decision(u, extra, 'property')) = 'plan_limit', 'capped before the comp');

  insert into public.listing_grants (user_id, remaining, source, note, effective_to)
  values (u, 5, 'admin_comp', 'launch partner', now() + interval '30 days');
  perform t.publish(u, extra);
  perform t.check(t.status(extra) = 'published', 'a live admin comp publishes past the plan cap');
end $$;

-- ---------------------------------------------------------------------------
-- A plan becoming live: down to 5 keeps the 5 most recent, back up restores
-- no more than the cap. Never deleted.
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := t.new_user('captrim@test');
  pages uuid[] := array[]::uuid[];
  i integer;
begin
  perform t.pay('txn-captrim', 'subscription_paid', u, 'agent_unlimited');
  for i in 1..8 loop
    pages := pages || t.new_listing(u, 'property');
    perform t.publish(u, pages[i]);
    update public.listings set published_at = now() - make_interval(days => 20 - i) where id = pages[i];
  end loop;

  -- Down to 5 pages (an admin moving the plan, or a payment for a new one).
  update public.subscriptions set plan_key = 'agent_basic' where account_id = u;
  perform public.restore_account(u, 'agent_basic');
  perform t.check((select count(*) from public.listings where owner_id = u and status = 'published') = 5,
    'moving to agent_basic leaves five pages published');
  perform t.check(t.status(pages[8]) = 'published' and t.status(pages[4]) = 'published', 'the five most recent');
  perform t.check(t.status(pages[1]) = 'unpublished' and t.status(pages[3]) = 'unpublished', 'the rest unpublished');
  perform t.check((select count(*) from public.listings where owner_id = u) = 8, 'nothing is deleted');
  perform t.check(not t.credit(pages[8]), 'the plan branding stays on the live pages');

  -- Expired, downgraded to free, then back on agent_basic: two live pages plus
  -- the three most recent unpublished ones, not all six.
  update public.subscriptions set status = 'expired' where account_id = u;
  perform public.downgrade_account(u);
  perform t.check((select count(*) from public.listings where owner_id = u and status = 'published') = 2, 'free keeps two');

  perform t.check(t.pay('txn-captrim2', 'subscription_paid', u, 'agent_basic') = 'agent_basic', 'a new agent_basic subscription');
  perform t.check((select count(*) from public.listings where owner_id = u and status = 'published') = 5,
    're-subscribing restores up to the cap, not every unpublished page');
  perform t.check(t.status(pages[8]) = 'published' and t.status(pages[4]) = 'published' and t.status(pages[3]) = 'unpublished',
    'the most recent ones come back first');

  -- Unlimited again: everything comes back.
  update public.subscriptions set plan_key = 'agent_unlimited' where account_id = u and status = 'active';
  perform public.restore_account(u, 'agent_unlimited');
  perform t.check((select count(*) from public.listings where owner_id = u and status = 'published') = 8, 'unlimited restores every page');
end $$;
