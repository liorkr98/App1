-- Paying through Tranzila, the first payment (migration 0049). Runs after
-- tests.sql, reusing its helpers. CLAUDE.md section 8.

create function t.service_fails(p_sql text, p_message text) returns boolean language plpgsql as $$
begin
  perform t.as_service(p_sql);
  return false;
exception when others then
  return sqlerrm = p_message;
end $$;

create function t.open(p_user uuid, p_plan text, p_listing uuid default null) returns uuid language plpgsql as $$
begin
  return t.as_service(format(
    'select session_id::text from public.open_checkout(%L, %L, %L, %L)',
    p_user, p_plan, p_listing, repeat('a', 64)))::uuid;
end $$;

create function t.complete(p_session uuid, p_txn text, p_amount integer, p_token text default null) returns text language plpgsql as $$
begin
  return t.as_service(format(
    'select public.complete_checkout(%L, %L, %s, %L, 12, 2030, %L)',
    p_session, p_txn, p_amount, p_token, '4242'));
end $$;

do $$
declare
  agent uuid := t.new_user('tz-agent@example.test');
  admin uuid := t.new_user('tz-admin@example.test');
  seller uuid := t.new_user('tz-seller@example.test');
  other uuid := t.new_user('tz-other@example.test');
  listing uuid;
  sid uuid;
  sid2 uuid;
  outcome text;
  seen integer;
  i integer;
begin
  insert into public.site_admins (user_id) values (admin);
  update public.cohort_counters set used = 0, cap = 200 where cohort = 'agent_launch';

  -- Off by default: nobody can open a payment window.
  perform t.check((select payments_mode from public.billing_config) = 'off', 'payments are off until the owner switches them on');
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', agent, 'agent_launch', repeat('a', 64)), 'payments_off'),
    'off refuses every checkout');

  -- Test: site admins only.
  update public.billing_config set payments_mode = 'test';
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', agent, 'agent_launch', repeat('a', 64)), 'test_only'),
    'test mode refuses an agent who is not a site admin');
  sid := t.open(admin, 'agent_launch');
  perform t.check((select amount_agorot from public.checkout_sessions where id = sid) = 3422,
    'the launch plan is charged 29 plus 18 percent VAT, worked out in the database');

  update public.billing_config set payments_mode = 'live';

  -- The amount never comes from outside: private plans already include VAT.
  listing := t.new_listing(seller, 'property');
  sid := t.open(seller, 'private_sale', listing);
  perform t.check((select amount_agorot from public.checkout_sessions where id = sid) = 1900, 'a private page is charged its price as shown');
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, %L, %L)', other, 'private_sale', listing, repeat('a', 64)), 'not_your_listing'),
    'nobody pays for a listing that is not theirs');
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', agent, 'free', repeat('a', 64)), 'unknown_plan'),
    'free is not something to pay for');
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', agent, 'agent', 'not-a-hash'), 'bad_nonce'),
    'a session needs its nonce hash');

  -- A user can neither write a session nor read a saved card.
  perform t.check(t.fails(agent, format(
    'insert into public.checkout_sessions (account_id, plan_key, amount_agorot, nonce_hash) values (%L, %L, 1, %L)',
    agent, 'agent', repeat('a', 64)), '42501'), 'a browser cannot create a session with its own amount');
  perform t.check(t.fails(seller, format('update public.checkout_sessions set amount_agorot = 1 where id = %L', sid), '42501'),
    'a browser cannot change an amount');

  -- Complete: wrong amount refused, right amount applied once.
  sid := t.open(agent, 'agent_launch');
  perform t.check(t.service_fails(format('select public.complete_checkout(%L, %L, %s)', sid, 'tz-1', 100), 'amount_mismatch'),
    'a transaction for another amount does not complete the session');
  outcome := t.complete(sid, 'tz-1', 3422, 'v1.aaaa.bbbb');
  perform t.check(outcome = 'agent_launch', 'a confirmed payment gives the launch plan');
  perform t.check((select status from public.live_subscription(agent)) = 'active', 'and the subscription is live');
  perform t.check(t.complete(sid, 'tz-1', 3422, 'v1.aaaa.bbbb') = 'duplicate', 'the same confirmation twice changes nothing');
  perform t.check(t.service_fails(format('select public.complete_checkout(%L, %L, %s)', sid, 'tz-2', 3422), 'session_already_paid'),
    'a paid session cannot be paid again by another transaction');
  perform t.check((select count(*) from public.payment_methods where account_id = agent and replaced_at is null) = 1,
    'the card token is kept, once');

  -- The saved card: invisible to every client, last four digits to its owner.
  perform t.check(t.fails(agent, 'select 1 / (select count(*) from public.payment_methods)::int', '42501'),
    'not even its owner can read the sealed token');
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  select count(*) into seen from public.my_payment_method() where last4 = '4242';
  reset role;
  perform t.check(seen = 1, 'the owner sees the last four digits');

  -- Confirmed first from the browser (no token), then by the notification.
  sid2 := t.open(other, 'agent');
  perform t.check(t.complete(sid2, 'tz-3', 5782) = 'agent', 'a confirmation without a token still gives the plan');
  perform t.check(not exists (select 1 from public.payment_methods where account_id = other), 'and keeps no card yet');
  perform t.check(t.complete(sid2, 'tz-3', 5782, 'v1.cccc.dddd') = 'duplicate', 'the notification that follows applies nothing twice');
  perform t.check((select token_sealed from public.payment_methods where account_id = other and replaced_at is null) = 'v1.cccc.dddd',
    'but its token is kept for the monthly charge');
  perform t.check(t.complete(sid2, 'tz-3', 5782, 'v1.eeee.ffff') = 'duplicate', 'a third copy of the same result');
  perform t.check((select token_sealed from public.payment_methods where account_id = other and replaced_at is null) = 'v1.cccc.dddd',
    'does not replace the card again');

  -- One plan at a time.
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', agent, 'agent', repeat('a', 64)), 'already_subscribed'),
    'a live plan cannot be paid for twice');

  -- A transaction completes one session only.
  sid2 := t.open(other, 'private_rent', t.new_listing(other, 'property'));
  perform t.check(t.service_fails(format('select public.complete_checkout(%L, %L, %s)', sid2, 'tz-1', 990), 'txn_already_used'),
    'a transaction already applied cannot complete another session');

  -- The launch cohort full: the window is not opened at the launch price.
  update public.cohort_counters set used = cap where cohort = 'agent_launch';
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', t.new_user('tz-late@example.test'), 'agent_launch', repeat('a', 64)), 'cohort_full'),
    'no launch price once the seats are gone');
  update public.cohort_counters set used = 1 where cohort = 'agent_launch';

  -- Ten windows in ten minutes is the most.
  for i in 1..9 loop
    perform t.open(seller, 'private_car', null);
  end loop;
  perform t.check(t.service_fails(format('select public.open_checkout(%L, %L, null, %L)', seller, 'private_car', repeat('a', 64)), 'too_many'),
    'an eleventh window in ten minutes is refused');

  -- Each sees their own sessions only.
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select count(*) into seen from public.checkout_sessions where account_id = agent;
  reset role;
  perform t.check(seen = 0, 'nobody reads another account sessions');

  update public.billing_config set payments_mode = 'off';
end $$;
