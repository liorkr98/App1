-- Operator console extras: every listing, ingest health, job backlog.
--
-- ============================ HUMAN REVIEW ============================
-- CLAUDE.md §8. This migration does NOT grant listings. It replaces
-- admin_site_overview with two extra counters (pending/failed jobs) and
-- adds admin_listings + admin_ingest_status. All three raise 42501 unless
-- is_site_admin(). Granting remains admin_grant_listings from 0016.
-- ======================================================================

revoke all on function public.admin_site_overview() from public, anon;

drop function if exists public.admin_site_overview();

create or replace function public.admin_site_overview()
returns table (
  users bigint,
  listings bigint,
  drafts bigint,
  published bigint,
  views_7d bigint,
  wa_7d bigint,
  unread_messages bigint,
  grants_remaining bigint,
  jobs_pending bigint,
  jobs_failed bigint
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
    select
      (select count(*) from public.profiles)::bigint,
      (select count(*) from public.listings)::bigint,
      (select count(*) from public.listings l where l.status = 'draft')::bigint,
      (select count(*) from public.listings l where l.status = 'published')::bigint,
      (
        select count(*) from public.listing_events e
        where e.kind = 'view' and e.created_at > now() - interval '7 days'
      )::bigint,
      (
        select count(*) from public.listing_events e
        where e.kind = 'wa' and e.created_at > now() - interval '7 days'
      )::bigint,
      (
        select count(*) from public.contact_messages m where m.read_at is null
      )::bigint,
      (
        select coalesce(sum(g.remaining), 0)
        from public.listing_grants g
        where g.effective_from <= now()
          and (g.effective_to is null or g.effective_to > now())
      )::bigint,
      (
        select count(*) from public.jobs j
        where j.status in ('queued', 'processing')
      )::bigint,
      (
        select count(*) from public.jobs j where j.status = 'failed'
      )::bigint;
end;
$$;

comment on function public.admin_site_overview() is
  'Admin-only site totals plus job backlog. Raises unless is_site_admin(). Does not grant.';

revoke all on function public.admin_site_overview() from public, anon;
grant execute on function public.admin_site_overview() to authenticated;

create or replace function public.admin_listings()
returns table (
  listing_id uuid,
  slug text,
  title text,
  status text,
  category text,
  owner_email text,
  created_at timestamptz,
  published_at timestamptz,
  views bigint,
  wa_taps bigint
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
    select
      l.id,
      l.slug,
      l.title,
      l.status::text,
      l.category::text,
      u.email::text,
      l.created_at,
      l.published_at,
      coalesce(c.views, 0),
      coalesce(c.wa_taps, 0)
    from public.listings l
    join auth.users u on u.id = l.owner_id
    left join public.listing_event_counts c on c.listing_id = l.id
    order by l.created_at desc
    limit 300;
end;
$$;

comment on function public.admin_listings() is
  'Admin-only directory of every listing, including drafts. Emails from auth.users. Does not grant.';

revoke all on function public.admin_listings() from public, anon;
grant execute on function public.admin_listings() to authenticated;

create or replace function public.admin_ingest_status()
returns table (
  source text,
  display_name text,
  last_synced_at timestamptz,
  last_attempted_at timestamptz,
  last_error text,
  row_count integer
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
    select
      s.source,
      s.display_name,
      s.last_synced_at,
      s.last_attempted_at,
      s.last_error,
      s.row_count
    from public.source_sync s
    order by s.source;
end;
$$;

comment on function public.admin_ingest_status() is
  'Admin-only ingestion freshness. Raises unless is_site_admin(). Does not grant.';

revoke all on function public.admin_ingest_status() from public, anon;
grant execute on function public.admin_ingest_status() to authenticated;
