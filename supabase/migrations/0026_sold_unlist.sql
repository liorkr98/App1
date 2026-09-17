-- Sold listings leave the public web. The seller still sees them on /mine.
-- The old URL must 404: a sold or deleted ad is not a page to forward.

drop policy if exists "listings_select_public" on public.listings;

create policy "listings_select_public"
  on public.listings
  for select
  to anon, authenticated
  using (status = 'published');
