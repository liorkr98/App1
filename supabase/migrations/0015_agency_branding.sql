-- Agency logos, a public bucket of their own.
--
-- derived is keyed on listing id (0004 / 0012). A logo belongs to the
-- agent, not to one listing, and it has to be on every page they send —
-- including ones published before they uploaded it, once they republish.
-- Putting it in derived would need a fake listing id, which is how a
-- path check gets walked around.
--
-- Path: {user_id}/logo.webp. The first segment is auth.uid(), same
-- shape as listing folders but a different table. Public read: the
-- listing page is opened from WhatsApp by someone with no account.
--
-- EXIF is stripped in the browser before upload (canvas re-encode),
-- same guarantee as 0012. The original is not kept — a logo is not a
-- photograph of someone's home.

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "branding_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'branding');

create policy "branding_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "branding_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "branding_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
