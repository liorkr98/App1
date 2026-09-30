-- Two things, both read-mostly.
--
-- 1. The designed WhatsApp card (share-card.ts). A new job kind, render_card,
--    in the Puppeteer process group, and one more key the worker may write
--    into listings.media: `card`, {url, key}. The listing page advertises the
--    card only while `key` matches what it shows now.
--
-- 2. Time to link — the product's promise, measured (plan §0: "time from
--    first photo to first link shared, < 4 min median"). From the listing row
--    being created, which the editor does as the agent starts, to the first
--    `share` event: the agent opening the share kit, or copying the link on
--    the dashboard. Nothing new is stored; this reads what is already there.
--
-- ADD VALUE cannot be used by a statement in the same transaction; nothing
-- below uses the new value, so this file runs as written.

alter type public.job_type add value if not exists 'render_card';

-- ---------------------------------------------------------------------------
-- attach_media_url: the allow-list gains `card`
-- ---------------------------------------------------------------------------
-- Same function as 0034, same grants: INVOKER, service role only. Only the
-- allow-list changes.

create or replace function public.attach_media_url(
  p_listing_id uuid,
  p_key text,
  p_value jsonb
)
returns void
language plpgsql
as $$
begin
  if p_key not in ('storyUrl', 'flyerUrl', 'depth', 'card') then
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
  'Records a worker output (storyUrl, flyerUrl, depth or card) on listings.media. Worker only.';

revoke all on function public.attach_media_url(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.attach_media_url(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- listing_time_to_link: per listing, for its owner
-- ---------------------------------------------------------------------------
-- security_invoker, and filtered to the caller's own listings on top of RLS:
-- listings_select_public would otherwise let anyone read another agent's
-- published rows through this view (their shares stay hidden by
-- listing_events_select_own, but their timings need not be listed at all).

create or replace view public.listing_time_to_link
with (security_invoker = true)
as
select
  l.id as listing_id,
  l.created_at as started_at,
  l.published_at,
  (
    select min(e.created_at)
    from public.listing_events e
    where e.listing_id = l.id
      and e.kind = 'share'
  ) as first_share_at
from public.listings l
where l.owner_id = (select auth.uid());

comment on view public.listing_time_to_link is
  'Per listing of the caller: when editing started, when it published, when the link was first shared. security_invoker.';

grant select on public.listing_time_to_link to authenticated;

-- ---------------------------------------------------------------------------
-- admin_time_to_link: the product-wide figure
-- ---------------------------------------------------------------------------
-- Medians, not means: one listing edited over two days would drag a mean
-- into hours and say nothing about the typical agent. Last 30 days of
-- listings. Admin only; reads, never grants (CLAUDE.md §8 does not apply).

create or replace function public.admin_time_to_link()
returns table (
  listings bigint,
  shared bigint,
  median_minutes_to_publish numeric,
  median_minutes_to_link numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  return query
    with recent as (
      select
        l.created_at,
        l.published_at,
        (
          select min(e.created_at)
          from public.listing_events e
          where e.listing_id = l.id and e.kind = 'share'
        ) as first_share_at
      from public.listings l
      where l.created_at > now() - interval '30 days'
    )
    select
      count(*)::bigint,
      count(r.first_share_at)::bigint,
      round((percentile_cont(0.5) within group (
        order by extract(epoch from (r.published_at - r.created_at)) / 60
      ) filter (where r.published_at is not null))::numeric, 1),
      round((percentile_cont(0.5) within group (
        order by extract(epoch from (r.first_share_at - r.created_at)) / 60
      ) filter (where r.first_share_at is not null))::numeric, 1)
    from recent r;
end;
$$;

comment on function public.admin_time_to_link() is
  'Admin-only: median minutes from starting a listing to publishing it and to first sharing its link, last 30 days. Raises unless is_site_admin().';

revoke all on function public.admin_time_to_link() from public, anon;
grant execute on function public.admin_time_to_link() to authenticated;
