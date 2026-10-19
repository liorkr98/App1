-- The agent's page options and the sold page they keep up (migration 0047).
-- Runs after tests.sql, reusing its helpers.

do $$
declare
  a uuid := t.new_user('page-options-a@example.test');
  b uuid := t.new_user('page-options-b@example.test');
  live uuid := t.new_listing(a, 'property');
  kept uuid := t.new_listing(a, 'property');
  gone uuid := t.new_listing(b, 'property');
  draft uuid := t.new_listing(a, 'property');
  seen_live int;
  seen_kept int;
  seen_gone int;
  seen_draft int;
begin
  -- The shape: known keys with their types, nothing else.
  perform t.as_user(a, format($q$update public.listings set extras = '{"visit": true, "calculator": false, "warranty": true}' where id = %L$q$, live));
  perform t.as_user(a, format($q$update public.listings set extras = '{"openHouse": {"start": "2026-10-23T10:00:00+03:00", "end": "2026-10-23T12:00:00+03:00"}}' where id = %L$q$, live));
  perform t.check((select extras ? 'openHouse' from public.listings where id = live), 'an open house of two hours is kept');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"pixel": "x"}' where id = %L$q$, live), '23514'), 'an unknown key is refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"visit": "yes"}' where id = %L$q$, live), '23514'), 'a key of the wrong type is refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '[]' where id = %L$q$, live), '23514'), 'extras that are not an object are refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"openHouse": {"start": "2026-10-23T12:00:00+03:00", "end": "2026-10-23T10:00:00+03:00"}}' where id = %L$q$, live), '23514'), 'an open house that ends before it starts is refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"openHouse": {"start": "2026-10-23T08:00:00+03:00", "end": "2026-10-23T20:00:00+03:00"}}' where id = %L$q$, live), '23514'), 'an open house of more than 8 hours is refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"openHouse": {"start": "Friday", "end": "Saturday"}}' where id = %L$q$, live), '23514'), 'an open house without a real date is refused');

  -- Who reads what: published always, sold only when the agent kept it up.
  -- Two free pages each (0045), so the third belongs to another agent.
  perform t.publish(a, live);
  perform t.publish(a, kept);
  perform t.publish(b, gone);
  perform t.as_user(a, format($q$update public.listings set status = 'sold', sold_public = true where id = %L$q$, kept));
  perform t.as_user(b, format($q$update public.listings set status = 'sold' where id = %L$q$, gone));

  execute 'set local role anon';
  select count(*) into seen_live from public.listings where id = live;
  select count(*) into seen_kept from public.listings where id = kept;
  select count(*) into seen_gone from public.listings where id = gone;
  select count(*) into seen_draft from public.listings where id = draft;
  execute 'reset role';

  perform t.check(seen_live = 1, 'a published page is public');
  perform t.check(seen_kept = 1, 'a sold page the agent kept up is public');
  perform t.check(seen_gone = 0, 'a sold page is gone by default, as 0026 decided');
  perform t.check(seen_draft = 0, 'a draft is never public');
end $$;
