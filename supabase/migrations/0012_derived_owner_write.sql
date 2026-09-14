-- Letting the browser write the public copy of a photograph.
--
-- ============================ HUMAN REVIEW =============================
-- THIS RELAXES A DELIBERATE SECURITY BOUNDARY. Read 0004 before this file.
--
-- 0004 says, in as many words:
--
--   THERE IS NO WRITE POLICY ON derived FOR ANY CLIENT ROLE.
--   Everything in this bucket is pipeline output. The worker writes it with
--   the service role, [because a client-written file could put] the seller's
--   home coordinates back on a public URL.
--
-- That reasoning is correct and it is why this migration exists rather than
-- somebody quietly adding a policy.
--
-- WHAT CHANGED. The Fly worker does not exist. Until it does, an agent's
-- photographs go into the private `originals` bucket and are never seen by
-- anyone — five uploads and a listing page with no picture, which is the state
-- the product was actually in.
--
-- WHY THE GPS RISK IS ADDRESSED RATHER THAN ACCEPTED. web/src/lib/
-- listing-photo.ts decodes each image to pixels with createImageBitmap, draws
-- it onto a canvas and reads it back with toBlob. The output is constructed
-- from pixel data alone — there is no path by which a byte of the original
-- container reaches it. EXIF, GPS, maker notes and embedded thumbnails are not
-- stripped by a step that could be skipped; they are never carried.
--
-- WHAT IS STILL TRUE. The ORIGINAL keeps going to the private bucket with its
-- metadata intact, so the real pipeline can reprocess properly when it exists.
-- Nothing here grants read access that was not already public, and nothing
-- here lets one agent write into another's folder.
-- =======================================================================

-- The owner may write the public copy of their OWN listing's photographs.
-- Same shape as originals_insert_own in 0004: the first path segment must be a
-- listing id that exists and belongs to the caller.
create policy "derived_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'derived'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- Replacing a photograph keeps the same object path, so the update has to be
-- permitted too or the second upload fails where the first succeeded.
create policy "derived_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'derived'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'derived'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- Removing a photograph from a listing should remove the public copy, not
-- leave it reachable by anyone who kept the URL.
create policy "derived_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'derived'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );
