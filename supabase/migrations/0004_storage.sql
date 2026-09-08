-- Storage buckets (Stage D6).
--
-- Two buckets, and the split is the security boundary:
--
--   originals  PRIVATE. What the seller's phone uploaded, EXIF and all.
--              A listing photo of someone's home carries GPS coordinates, so
--              the original must never be publicly reachable.
--
--   derived    PUBLIC. Only pipeline output — enhanced WebP, panoramas,
--              sprites, OG images, PDFs. EXIF is stripped during processing,
--              so nothing here carries location metadata.
--
-- Path convention in both: {listing_id}/{...}. Every policy below keys off the
-- first path segment, which is why it must be the listing id.

insert into storage.buckets (id, name, public)
values ('originals', 'originals', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('derived', 'derived', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- originals — the owner uploads and reads; nobody else, ever
-- ---------------------------------------------------------------------------

-- The owner may upload into their own listing's folder. Uploads use a signed,
-- expiring URL issued after this check, so a client never holds a broad token.
create policy "originals_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'originals'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- The owner may read back their own originals — needed to re-edit a listing.
create policy "originals_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'originals'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- The owner may delete their own originals. Required by the account-deletion
-- path (CLAUDE.md §7) and by removing a photo from a listing.
create policy "originals_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'originals'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

-- NO anon policy on originals. Deliberate: this is the bucket holding
-- unstripped EXIF.

-- ---------------------------------------------------------------------------
-- derived — world-readable, written only by the worker
-- ---------------------------------------------------------------------------

-- Anyone may read derived assets. The listing page is a public URL opened from
-- a WhatsApp message by someone with no account, so its images must be
-- readable without a session.
create policy "derived_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'derived');

-- THERE IS NO WRITE POLICY ON derived FOR ANY CLIENT ROLE.
--
-- Everything in this bucket is pipeline output. The worker writes it with the
-- service role, which bypasses RLS. If a client could write here it could
-- replace a processed photo with an unprocessed one — putting EXIF, and the
-- seller's home coordinates, back on a public URL.
