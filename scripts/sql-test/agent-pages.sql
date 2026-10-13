-- Agent pages (migration 0041). Runs after tests.sql, reusing its helpers.
-- Each block raises on a failed expectation; run.sh stops at the first.

do $$
declare
  agent uuid := t.new_user('page-agent@example.test');
  other uuid := t.new_user('page-other@example.test');
  private uuid := t.new_user('page-private@example.test');
  live uuid; sold uuid; draft uuid; gone uuid; bought uuid;
  code text;
  page jsonb;
begin
  update public.profiles set account_kind = 'agent', display_name = 'נועה כהן', phone = '0521234567',
    agency_name = 'כהן נכסים' where id = agent;
  update public.profiles set account_kind = 'agent' where id = other;
  update public.profiles set account_kind = 'private' where id = private;

  -- The columns are not the agent's to write.
  perform t.as_user(agent, format(
    'update public.profiles set page_enabled = true, page_code = %L, page_handle = %L where id = %L',
    'ABCDE', 'stolen', agent));
  perform t.check(
    (select not page_enabled and page_code is null and page_handle is null from public.profiles where id = agent),
    'a direct update cannot turn the page on or pick its addresses');

  -- Only agents, offices and dealers.
  perform t.check(t.fails(private, 'select public.enable_agent_page()', '42501'), 'a private seller cannot turn a page on');

  -- Off: invisible.
  perform t.check(public.public_agent('ABCDE') is null, 'no page answers before one is turned on');

  perform set_config('request.jwt.claim.sub', agent::text, true);
  code := public.enable_agent_page();
  perform t.check(code ~ '^[0-9A-HJKMNP-TV-Z]{5}$', 'turning the page on gives a five-character code');
  perform t.check(public.enable_agent_page() = code, 'the code is given once and kept');

  -- Handles.
  perform t.check(public.agent_handle_available('No') = 'format', 'too short is a format problem');
  perform t.check(public.agent_handle_available('noa cohen') = 'format', 'a space is a format problem');
  perform t.check(public.agent_handle_available('-noa') = 'format', 'a leading hyphen is a format problem');
  perform t.check(public.agent_handle_available('admin') = 'reserved', 'a site path is reserved');
  perform t.check(public.agent_handle_available('Noa-Cohen') is null, 'a free handle is available, case aside');
  perform t.check(public.set_agent_handle('Noa-Cohen') = 'noa-cohen', 'a handle is stored lower case');
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform t.check(public.agent_handle_available('NOA-COHEN') = 'taken', 'another agent''s handle is taken, any case');
  perform t.check(t.fails(other, 'select public.set_agent_handle(''noa-cohen'')', '22023', 'taken'), 'setting a taken handle is refused');
  perform set_config('request.jwt.claim.sub', agent::text, true);
  perform t.check(public.agent_handle_available('noa-cohen') is null, 'your own handle is available to you');

  -- Listings: live and sold, never a draft, an archived page or an expired one-time page.
  live := t.new_listing(agent, 'property');
  perform t.publish(agent, live);
  sold := t.new_listing(agent, 'property');
  perform t.publish(agent, sold);
  update public.listings set status = 'sold' where id = sold;
  draft := t.new_listing(agent, 'property');
  gone := t.new_listing(agent, 'property');
  update public.listings set status = 'archived' where id = gone;

  page := public.public_agent(code);
  perform t.check(page ->> 'handle' = 'noa-cohen', 'the page answers to its code');
  perform t.check(public.public_agent('noa-cohen') ->> 'code' = code, 'and to its handle');
  perform t.check(public.public_agent('NOA-COHEN') is null, 'a handle is matched as stored, lower case');
  perform t.check(jsonb_array_length(page -> 'listings') = 2, 'live and sold listings show, nothing else');
  perform t.check(page -> 'listings' ->> 0 = (select slug from public.listings where id = live), 'live listings come before sold ones');
  perform t.check(not (page ? 'email') and not (page ? 'id') and not (page::text like '%' || agent::text || '%'),
    'the page carries no email and no account id');
  perform t.check(page ->> 'licence_verified' = 'false', 'no licence badge without a passed check');

  -- purchase_id and expires_at are 0040's protected columns: only a trusted write sets them.
  perform set_config('billing.trusted', '1', true);
  insert into public.purchases (account_id, plan_key, listing_id, amount_agorot, expires_at)
  values (agent, 'private_sale', live, 1900, now() - interval '1 day') returning id into bought;
  update public.listings set purchase_id = bought, expires_at = now() - interval '1 day' where id = live;
  perform set_config('billing.trusted', '0', true);
  perform t.check((select expires_at is not null from public.listings where id = live), 'the test really expired the page');
  perform t.check(jsonb_array_length(public.public_agent(code) -> 'listings') = 1, 'a one-time page past its days drops off');

  perform t.check(exists (select 1 from public.public_agent_keys() k where k.key = 'noa-cohen'), 'the sitemap lists the page by its handle');

  perform public.disable_agent_page();
  perform t.check(public.public_agent(code) is null and public.public_agent('noa-cohen') is null, 'turned off, the page is gone');
  perform t.check(not exists (select 1 from public.public_agent_keys() k where k.key = 'noa-cohen'), 'and leaves the sitemap');
end $$;
