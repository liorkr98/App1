-- The price went down (migration 0043). Runs after the other test files,
-- reusing tests.sql's helpers. Each block raises on a failed expectation.

do $$
declare
  agent uuid := t.new_user('drop-agent@example.test');
  live uuid; draft uuid;
  was numeric; at timestamptz;
begin
  live := t.new_listing(agent, 'property');
  update public.listings set price = 2000000 where id = live;
  perform t.publish(agent, live);

  -- Nobody writes the two columns.
  perform t.as_user(agent, format(
    'update public.listings set price_was = 9999999, price_dropped_at = now() where id = %L', live));
  perform t.check((select price_was is null and price_dropped_at is null from public.listings where id = live),
    'a direct write to price_was or price_dropped_at is ignored');

  -- A rise is not a drop.
  perform t.as_user(agent, format('update public.listings set price = 2100000 where id = %L', live));
  perform t.check((select price_was is null from public.listings where id = live), 'a higher price is not a drop');

  -- A drop remembers where it came from.
  perform t.as_user(agent, format('update public.listings set price = 1900000 where id = %L', live));
  select price_was, price_dropped_at into was, at from public.listings where id = live;
  perform t.check(was = 2100000 and at is not null, 'a lower price on a live listing remembers the old price');

  -- A second drop inside 14 days is measured from the first price.
  perform t.as_user(agent, format('update public.listings set price = 1850000 where id = %L', live));
  perform t.check((select price_was from public.listings where id = live) = 2100000,
    'a second drop keeps the price the drop started from');

  -- A partial rise keeps the drop; back to the old price clears it.
  perform t.as_user(agent, format('update public.listings set price = 1950000 where id = %L', live));
  perform t.check((select price_was from public.listings where id = live) = 2100000, 'still below the old price: still a drop');
  perform t.as_user(agent, format('update public.listings set price = 2100000 where id = %L', live));
  perform t.check((select price_was is null and price_dropped_at is null from public.listings where id = live),
    'back at the old price: no drop');

  -- A drop after the 14 days starts again from the price it came down from.
  perform t.as_user(agent, format('update public.listings set price = 2000000 where id = %L', live));
  update public.listings set price_dropped_at = now() - interval '20 days' where id = live;
  perform t.check((select price_dropped_at > now() - interval '1 minute' from public.listings where id = live),
    'the columns cannot be backdated by a direct write either');
  alter table public.listings disable trigger listings_track_price_drop;
  update public.listings set price_dropped_at = now() - interval '20 days' where id = live;
  alter table public.listings enable trigger listings_track_price_drop;
  perform t.as_user(agent, format('update public.listings set price = 1990000 where id = %L', live));
  perform t.check((select price_was from public.listings where id = live) = 2000000,
    'a drop after 14 days is measured from the price just before it');

  -- Only a live listing starts a drop, and 0 is never part of one.
  draft := t.new_listing(agent, 'vehicle');
  update public.listings set price = 90000 where id = draft;
  perform t.as_user(agent, format('update public.listings set price = 80000 where id = %L', draft));
  perform t.check((select price_was is null from public.listings where id = draft), 'a draft never starts a drop');
  perform t.as_user(agent, format('update public.listings set price = 0 where id = %L', live));
  perform t.check((select price_was is null from public.listings where id = live), 'a price of 0 ends the drop and starts none');

  -- Another agent cannot touch the row at all (the existing update policy).
  perform t.as_user(t.new_user('drop-other@example.test'), format('update public.listings set price = 1 where id = %L', live));
  perform t.check((select price from public.listings where id = live) = 0, 'another agent''s update changes nothing');
end $$;
