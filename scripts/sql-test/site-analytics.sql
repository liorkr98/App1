-- Site analytics (migration 0042). Runs after tests.sql, reusing its helpers.
-- Each block raises on a failed expectation; run.sh stops at the first.

do $$
declare
  admin uuid := t.new_user('data-admin@example.test');
  agent uuid := t.new_user('data-agent@example.test');
  seller uuid := t.new_user('data-seller@example.test');
  quitter uuid := t.new_user('data-quitter@example.test');
  live uuid; old uuid;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  data jsonb;
  base jsonb;
  step jsonb;
begin
  insert into public.site_admins (user_id) values (admin);
  update public.profiles set account_kind = 'agent', display_name = 'נועה כהן', phone = '0521234567' where id = agent;
  update public.profiles set account_kind = 'private' where id = seller;

  -- Earlier test files leave rows behind: compare against where they left it.
  perform set_config('request.jwt.claim.sub', admin::text, true);
  base := public.admin_analytics(30);

  -- record_site_view: what counts, and how it is stored.
  execute 'set local role anon';
  perform public.record_site_view('/', 'google.com');
  perform public.record_site_view('/', 'google.com');
  perform public.record_site_view('/pricing', null);
  perform public.record_site_view('/Pricing/', '');
  perform public.record_site_view('/agent/noa-cohen/', 'facebook.com');
  perform public.record_site_view('/a/T4V7A/', 'direct');
  perform public.record_site_view('/admin/', 'direct');
  perform public.record_site_view('/api/site-view', 'direct');
  perform public.record_site_view('/template-check/agent/', 'direct');
  perform public.record_site_view('https://evil.example/', 'direct');
  perform public.record_site_view('/<script>/', 'direct');
  perform public.record_site_view('/guide/', 'Bad Source!');
  perform public.record_site_view('/a/b/c/d/e/', 'direct');
  execute 'reset role';

  perform t.check((select views from public.site_page_views where day = today and path = '/' and source = 'google.com') = 2,
    'two visits from one source add up on one row');
  perform t.check((select views from public.site_page_views where day = today and path = '/pricing/' and source = 'direct') = 2,
    'a path is stored lower case with a trailing slash; an empty source is direct');
  perform t.check(exists (select 1 from public.site_page_views where path = '/agent/' and source = 'facebook.com'),
    'an agent page is folded into /agent/');
  perform t.check(not exists (select 1 from public.site_page_views where path like '%noa%'),
    'a handle is never stored');
  perform t.check(not exists (select 1 from public.site_page_views where path ~ '^/(a|admin|api|template-check)/'),
    'listing pages, the admin, the API and fixtures are not site visits');
  perform t.check((select count(*) from public.site_page_views) = 4, 'nothing malformed was stored');
  perform t.check(exists (select 1 from public.site_page_views where path = '/guide/' and source = 'direct'),
    'a source that is not a host-like word becomes direct');

  -- Nobody but an admin reads the table, and nobody writes it directly.
  perform t.as_user(agent, 'create temp table seen as select count(*) as n from public.site_page_views');
  perform t.check((select n from seen) = 0, 'an agent sees no site visits');
  drop table seen;
  perform t.check(t.fails(agent, 'insert into public.site_page_views (day, path, source, views) values (current_date, ''/x/'', ''direct'', 999)', '42501'),
    'a person cannot write visits directly');

  -- The data page itself.
  perform t.check(t.fails(agent, 'select public.admin_analytics(30)', '42501'), 'a non-admin is refused the data page');


  live := t.new_listing(agent, 'property');
  perform t.publish(agent, live);
  insert into public.listing_events (listing_id, kind) values
    (live, 'view'), (live, 'view'), (live, 'view'), (live, 'wa'), (live, 'scroll_75');
  -- Forty days ago: the previous 30-day window, not this one.
  old := t.new_listing(seller, 'vehicle');
  perform t.publish(seller, old);
  update public.listings set created_at = now() - interval '40 days', published_at = now() - interval '40 days' where id = old;
  insert into public.listing_events (listing_id, kind, created_at) values
    (old, 'view', now() - interval '40 days'), (old, 'view', now() - interval '40 days');

  -- The funnel: the agent goes all the way, twice through photos; the
  -- quitter stops at photos; the seller stops at plate (a car step).
  insert into public.editor_events (user_id, step, kind) values
    (agent, 'category', 'enter'), (agent, 'details', 'enter'), (agent, 'photos', 'enter'),
    (agent, 'photos', 'enter'), (agent, 'photos', 'blocked'), (agent, 'publish', 'publish_ok'),
    (quitter, 'category', 'enter'), (quitter, 'details', 'enter'), (quitter, 'photos', 'enter'),
    (quitter, 'photos', 'blocked'),
    (seller, 'category', 'enter'), (seller, 'details', 'enter'), (seller, 'plate', 'enter');

  insert into public.billing_events (account_id, event) values (seller, 'free_limit_hit'), (seller, 'paywall_shown');

  perform set_config('request.jwt.claim.sub', admin::text, true);
  data := public.admin_analytics(30);

  perform t.check((data ->> 'days')::int = 30 and (data ->> 'to')::date = today, 'the window ends today, Israel time');
  perform t.check(jsonb_array_length(data -> 'series') = 30, 'one series row per day, empty days included');
  perform t.check(((data #>> '{current,views}')::int - coalesce((base #>> '{current,views}')::int, 0)) = 3, 'this period''s listing views');
  perform t.check(((data #>> '{previous,views}')::int - coalesce((base #>> '{previous,views}')::int, 0)) = 2, 'views from forty days ago land in the previous period');
  perform t.check(((data #>> '{current,taps}')::int - coalesce((base #>> '{current,taps}')::int, 0)) = 1 and ((data #>> '{current,reads}')::int - coalesce((base #>> '{current,reads}')::int, 0)) = 1, 'taps and reads');
  perform t.check(((data #>> '{current,published}')::int - coalesce((base #>> '{current,published}')::int, 0)) = 1 and ((data #>> '{previous,published}')::int - coalesce((base #>> '{previous,published}')::int, 0)) = 1,
    'publishing is split by period');
  perform t.check(((data #>> '{current,visits}')::int - coalesce((base #>> '{current,visits}')::int, 0)) = 6, 'site visits are summed');
  perform t.check(((data #>> '{current,paywall}')::int - coalesce((base #>> '{current,paywall}')::int, 0)) = 2, 'paywall hits count both kinds');
  perform t.check(((data #>> '{current,editors}')::int - coalesce((base #>> '{current,editors}')::int, 0)) = 3, 'people in the editor are counted once each');
  perform t.check((select sum((x ->> 'views')::int) from jsonb_array_elements(data -> 'series') x) = (data #>> '{current,views}')::int,
    'the series adds up to the total');

  select x into step from jsonb_array_elements(data -> 'funnel') x where x ->> 'step' = 'photos';
  perform t.check((step ->> 'entered')::int = 2, 'photos was entered by two people, not three events');
  perform t.check((step ->> 'blocked')::int = 2, 'two people were blocked at photos');
  perform t.check((step ->> 'stopped')::int = 1, 'one person who did not publish stopped at photos');
  select x into step from jsonb_array_elements(data -> 'funnel') x where x ->> 'step' = 'plate';
  perform t.check((step ->> 'stopped')::int = 1, 'the seller stopped at plate');
  perform t.check(jsonb_array_length(data -> 'funnel') = 12, 'every step is listed, in order');
  perform t.check(data -> 'funnel' -> 0 ->> 'step' = 'category', 'the funnel starts at category');

  perform t.check(data -> 'top_listings' -> 0 ->> 'slug' = (select slug from public.listings where id = live), 'the top listing');
  perform t.check(data -> 'top_pages' -> 0 ->> 'path' in ('/', '/pricing/'), 'the top pages');
  perform t.check(((data #>> '{status,published}')::int - coalesce((base #>> '{status,published}')::int, 0)) = 2, 'status is a count of now');

  perform t.check(
    data::text !~ '@' and data::text not like '%נועה%' and data::text not like '%0521234567%'
      and data::text not like '%' || agent::text || '%' and data::text not like '%test%',
    'nothing personal: no email, name, phone, account id or listing text');

  -- Raises if the authenticated role cannot run it (or what it calls).
  perform t.as_user(admin, 'select public.admin_analytics(30)');
  perform t.check(true, 'an admin can read it as a signed-in person, through the authenticated role');
  perform t.check(t.fails(admin, 'select public.admin_analytics_totals(now(), now(), current_date, current_date)', '42501'),
    'the internal totals function is not callable directly');
  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform t.check((public.admin_analytics(7) ->> 'days')::int = 7, 'a seven-day window');
  perform t.check((public.admin_analytics(9999) ->> 'days')::int = 366, 'a window is at most a year');
end $$;
