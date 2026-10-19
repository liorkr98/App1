-- What a signed-in agent can read of other agents' listings (19 Oct 2026).
-- Runs after tests.sql, reusing its helpers.
--
-- listings_select_public (0002, 0026) applies to `authenticated` as well as
-- `anon`, and policies are combined with OR. So RLS alone returns every
-- published listing to every signed-in agent, and /mine listed them as the
-- agent's own. This pins that fact, so the owner_id filter on /mine and in
-- the editor's loadListing is never taken out as redundant.

do $$
declare
  a uuid := t.new_user('owner-reads-a@example.test');
  b uuid := t.new_user('owner-reads-b@example.test');
  live uuid := t.new_listing(a, 'property');
  draft uuid := t.new_listing(a, 'property');
  everyone int;
  mine int;
  hidden int;
begin
  perform t.publish(a, live);

  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  select count(*) into everyone from public.listings where id in (live, draft);
  select count(*) into mine from public.listings where id in (live, draft) and owner_id = b;
  select count(*) into hidden from public.listings where id = draft;
  execute 'reset role';

  perform t.check(everyone = 1, 'RLS alone shows another agent''s published listing to a signed-in agent');
  perform t.check(mine = 0, 'with owner_id, another agent''s listings are not "mine"');
  perform t.check(hidden = 0, 'another agent''s draft is never readable');
end $$;
