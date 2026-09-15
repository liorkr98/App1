-- Listing events: views and WhatsApp taps. No JavaScript on the buyer page.
--
-- A view is recorded by the SSR listing route (prerender = false). A WhatsApp
-- tap is recorded by /a/[slug]/wa before the 302 to wa.me. Scrapers are
-- filtered in the application, not here — this table must not hold a user
-- agent or an IP (CLAUDE.md §9, never log PII).
--
-- Inserts go through record_listing_event, which only writes for a
-- published or sold slug. There is no client INSERT policy.

create table if not exists public.listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind text not null check (kind in ('view', 'wa')),
  created_at timestamptz not null default now()
);

comment on table public.listing_events is
  'SSR view and WhatsApp-tap counts. No UA, no IP. Insert via record_listing_event.';

create index if not exists listing_events_listing_kind_idx
  on public.listing_events (listing_id, kind, created_at desc);

alter table public.listing_events enable row level security;

create policy "listing_events_select_own"
  on public.listing_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and l.owner_id = (select auth.uid())
    )
  );

create policy "listing_events_select_admin"
  on public.listing_events
  for select
  to authenticated
  using (public.is_site_admin());

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.

create or replace function public.record_listing_event(p_slug text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid uuid;
begin
  if p_kind not in ('view', 'wa') then
    return;
  end if;

  if p_slug is null or p_slug !~ '^[0-9A-HJKMNP-TV-Z]{5}$' then
    return;
  end if;

  select l.id into lid
  from public.listings l
  where l.slug = p_slug
    and l.status in ('published', 'sold')
  limit 1;

  if lid is null then
    return;
  end if;

  insert into public.listing_events (listing_id, kind) values (lid, p_kind);
end;
$$;

comment on function public.record_listing_event(text, text) is
  'Anon-callable insert of a view or wa event for a live listing. Silent no-op on unknown slugs.';

revoke all on function public.record_listing_event(text, text) from public;
grant execute on function public.record_listing_event(text, text) to anon, authenticated;

create or replace view public.listing_event_counts
with (security_invoker = true)
as
select
  e.listing_id,
  count(*) filter (where e.kind = 'view')::bigint as views,
  count(*) filter (where e.kind = 'wa')::bigint as wa_taps
from public.listing_events e
group by e.listing_id;

comment on view public.listing_event_counts is
  'Per-listing rollup. security_invoker so an agent only sees their own events.';

grant select on public.listing_event_counts to authenticated;

-- Admin rollup across every listing. Raises unless is_site_admin().
create or replace function public.admin_event_rollups()
returns table (
  listing_id uuid,
  slug text,
  title text,
  status text,
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
      coalesce(c.views, 0),
      coalesce(c.wa_taps, 0)
    from public.listings l
    left join public.listing_event_counts c on c.listing_id = l.id
    where l.status in ('published', 'sold')
    order by coalesce(c.views, 0) desc, l.published_at desc nulls last
    limit 200;
end;
$$;

comment on function public.admin_event_rollups() is
  'Admin-only view/wa counts for live listings. Empty for everyone else (raises).';

revoke all on function public.admin_event_rollups() from public, anon;
grant execute on function public.admin_event_rollups() to authenticated;
