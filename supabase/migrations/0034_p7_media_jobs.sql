-- P7: the free "wow" media (plan §12f).
--
-- Two new job kinds and one write path back into listings.media.
--
--   render_story  a 1080 × 1920 story image of the listing, rendered by the
--                 Puppeteer process group from /a/{slug}/story
--   depth_map     a greyscale depth map of the cover, for the depth hero
--
-- The A4 QR flyer is a render_pdf job with scope_key 'flyer' (it renders
-- /a/{slug}/flyer instead of the listing page), so it needs no new kind.
--
-- ADD VALUE cannot be used by a statement in the same transaction; nothing
-- below uses the new values, so this file runs as written.

alter type public.job_type add value if not exists 'render_story';
alter type public.job_type add value if not exists 'depth_map';

-- ---------------------------------------------------------------------------
-- attach_media_url: one keyed URL into listings.media
-- ---------------------------------------------------------------------------
-- The same shape as attach_pdf (0005), for the three new outputs. The key is
-- an allow-list, not a free path: a worker bug cannot write into
-- media.cover or anywhere else by passing a different key.
--
--   storyUrl   the story image
--   flyerUrl   the flyer PDF
--   depth      {url, cover} — the depth map AND the cover URL it was made
--              from, so the page can refuse a map for a cover that has
--              since been replaced (the value is jsonb for that reason)

create or replace function public.attach_media_url(
  p_listing_id uuid,
  p_key text,
  p_value jsonb
)
returns void
language plpgsql
as $$
begin
  if p_key not in ('storyUrl', 'flyerUrl', 'depth') then
    raise exception 'media key % is not writable', p_key;
  end if;

  update public.listings
  set media = jsonb_set(coalesce(media, '{}'::jsonb), array[p_key], p_value, true)
  where id = p_listing_id;

  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;
end;
$$;

comment on function public.attach_media_url(uuid, text, jsonb) is
  'Records a worker output (storyUrl, flyerUrl or depth) on listings.media. Worker only.';

-- INVOKER, and callable by the service role alone — the same grants as the
-- attach functions in 0005, for the same reasons written there.
revoke all on function public.attach_media_url(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.attach_media_url(uuid, text, jsonb) to service_role;
