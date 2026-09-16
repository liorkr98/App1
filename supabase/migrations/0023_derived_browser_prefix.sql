-- The browser may write the public copy ONLY under `{listingId}/browser/`.
--
-- ============================ WHY THIS IS HERE ============================
-- THESE POLICIES WERE ALREADY LIVE AND WERE NEVER COMMITTED. They were applied
-- straight to the project on 14 September 2026 as `derived_browser_prefix`,
-- replacing the three policies 0012 creates, and no file recorded it. The
-- repository and the database therefore disagreed about the rule, and the
-- disagreement was invisible from either side on its own:
--
--   * 0012 permits any path whose FIRST segment is a listing the caller owns.
--   * The live policies additionally require the SECOND segment to be
--     literally `browser`.
--
-- web/src/lib/listing-photo.ts wrote `{listingId}/{file}.webp`, matching the
-- committed policy and failing the live one, so every public copy an agent
-- uploaded was refused with
--
--   403 new row violates row-level security policy   ->   HTTP 400
--
-- The editor treated that as "no URL yet" and carried on, which is how a
-- listing came to be published with its photographs in `originals`, `media`
-- empty and a page that could not be rendered at all.
--
-- This file makes the repository say what the database says. The code now
-- writes the prefix (same commit).
--
-- THE RULE ITSELF IS KEPT, not reverted, because it is the better rule: a
-- browser cannot write over anything the worker produced — the enhanced
-- ladder at `{listingId}/{stem}-{width}.webp`, and above all the WhatsApp card
-- at `og/{listingId}-{hash}.webp`, which decides whether anybody opens the
-- listing (CLAUDE.md §6). A prefix is how that boundary is expressed in a
-- bucket both of them write to.
--
-- Everything 0012 says about EXIF still holds and is what makes any browser
-- write to a public bucket acceptable: listing-photo.ts decodes to pixels and
-- re-encodes from a canvas, so no byte of the original container — and no GPS
-- fix from a photograph of somebody's home — is ever carried.
--
-- Written idempotently: the policies exist on the live project already, so
-- this must be safe to apply to a database that is already in the end state.
-- =========================================================================

drop policy if exists "derived_insert_own" on storage.objects;
drop policy if exists "derived_update_own" on storage.objects;
drop policy if exists "derived_delete_own" on storage.objects;

drop policy if exists "derived_insert_own_browser" on storage.objects;
drop policy if exists "derived_update_own_browser" on storage.objects;
drop policy if exists "derived_delete_own_browser" on storage.objects;

create policy "derived_insert_own_browser"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'derived'
    and (storage.foldername(name))[2] = 'browser'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- Replacing a photograph keeps the same object path, so the update has to be
-- permitted too or the second upload fails where the first succeeded.
create policy "derived_update_own_browser"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'derived'
    and (storage.foldername(name))[2] = 'browser'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'derived'
    and (storage.foldername(name))[2] = 'browser'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- Removing a photograph from a listing should remove the public copy, not
-- leave it reachable by anyone who kept the URL.
create policy "derived_delete_own_browser"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'derived'
    and (storage.foldername(name))[2] = 'browser'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );
