-- Temporary client writes into `derived`, while the Fly worker is absent.
--
-- 0004 left derived world-readable and worker-writable only. That is the
-- right long-term shape: pipeline output, EXIF already stripped, no GPS on a
-- public URL. The worker that would do the stripping does not exist yet, so
-- a listing saved today would have originals in a private bucket and nothing
-- a buyer could see.
--
-- WHAT THIS ALLOWS. The signed-in owner may write objects under
--   {listing_id}/browser/...
-- in `derived`. The second path segment is the whole security of the EXIF
-- rule: the editor re-encodes on a canvas before upload (web/src/lib/
-- listing-photo.ts), which drops GPS, and the worker — when it exists —
-- writes everywhere else in the bucket with the service role. A client
-- cannot overwrite an OG card or a processed variant because those paths
-- do not start with `browser`.
--
-- Reversible: drop the three policies the day the worker is the writer.

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
