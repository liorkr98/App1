-- The page film switch (migration 0048). Runs after tests.sql, reusing its helpers.

do $$
declare
  a uuid := t.new_user('page-film-a@example.test');
  listing uuid := t.new_listing(a, 'property');
begin
  perform t.as_user(a, format($q$update public.listings set extras = '{"film": true, "visit": true}' where id = %L$q$, listing));
  perform t.check((select extras ? 'film' from public.listings where id = listing), 'the film switch is kept');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"film": "yes"}' where id = %L$q$, listing), '23514'), 'a film switch that is not true or false is refused');
  perform t.check(t.fails(a, format($q$update public.listings set extras = '{"films": true}' where id = %L$q$, listing), '23514'), 'a key 0048 does not know is still refused');
end $$;
