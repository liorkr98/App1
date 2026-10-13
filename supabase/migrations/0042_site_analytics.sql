-- 0042 — Site analytics for the owner's data page (13 Oct 2026).
--
-- Two things:
--
--   1. site_page_views: visits to the site's own pages (the homepage,
--      pricing, the guides...), which nothing recorded until now. One row per
--      Israel day, path and source, holding a count. No cookie, no user
--      agent, no IP, no person: the Worker decides whether a visit counts
--      (bots, the signed-in owner) and calls record_site_view, which is the
--      only writer. Listing pages are counted by listing_events, not here,
--      and an agent page is folded into '/agent/' because a handle is often
--      a person's name.
--
--   2. admin_analytics(p_days): everything the data page shows, in one
--      call, for the period and the period before it. Admin only. Counts and
--      step names; never an email, a name, a phone or a listing's text, so
--      the page can hand it to DeepSeek as it is.
--
-- Reads, never grants (CLAUDE.md §8 does not apply). Safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Site visits
-- ---------------------------------------------------------------------------

create table if not exists public.site_page_views (
  day date not null,
  path text not null check (path ~ '^/[a-z0-9/-]{0,80}$'),
  source text not null check (source ~ '^[a-z0-9.-]{1,40}$'),
  views integer not null default 0 check (views >= 0),
  primary key (day, path, source)
);

comment on table public.site_page_views is
  'Visits to the site''s own pages per Israel day, path and source (0042). Counts only. Written by record_site_view.';

alter table public.site_page_views enable row level security;

drop policy if exists "site_page_views_select_admin" on public.site_page_views;
create policy "site_page_views_select_admin"
  on public.site_page_views
  for select
  to authenticated
  using (public.is_site_admin());

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.

-- The path as stored, or null when it is not one we count. Lower case, a
-- trailing slash, at most four segments; account pages, the editor, the API,
-- CI fixtures and listing pages are not site visits.
create or replace function public.site_view_path(p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  path text := lower(coalesce(p_path, ''));
begin
  if path !~ '^/[a-z0-9/-]{0,80}$' or path ~ '//' then
    return null;
  end if;
  if right(path, 1) <> '/' then
    path := path || '/';
  end if;
  if path ~ '^/(a|api|admin|me|mine|new|enter|up|lab|preview|template-check)/' then
    return null;
  end if;
  if path ~ '^/agent/.' then
    return '/agent/';
  end if;
  if array_length(string_to_array(trim(both '/' from path), '/'), 1) > 4 then
    return null;
  end if;
  return path;
end;
$$;

-- 'direct' unless it is a plain host-like word.
create or replace function public.site_view_source(p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(trim(coalesce(p_source, ''))) ~ '^[a-z0-9.-]{1,40}$' then lower(trim(p_source))
    else 'direct'
  end;
$$;

create or replace function public.record_site_view(p_path text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text := public.site_view_path(p_path);
begin
  if stored is null then
    return;
  end if;
  insert into public.site_page_views as v (day, path, source, views)
  values ((now() at time zone 'Asia/Jerusalem')::date, stored, public.site_view_source(p_source), 1)
  on conflict on constraint site_page_views_pkey do update set views = v.views + 1;
end;
$$;

comment on function public.record_site_view(text, text) is
  'Anon-callable +1 for a site page on today''s Israel day. Silent no-op on a path that is not counted.';

revoke all on function public.site_view_path(text) from public;
revoke all on function public.site_view_source(text) from public;
revoke all on function public.record_site_view(text, text) from public;
grant execute on function public.record_site_view(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The data page
-- ---------------------------------------------------------------------------

-- Totals for one window: [p_start, p_end) in time, [p_from, p_to] in Israel
-- days. Internal: called by admin_analytics, which has checked the caller.
create or replace function public.admin_analytics_totals(
  p_start timestamptz,
  p_end timestamptz,
  p_from date,
  p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signups', (
      select count(*) from public.profiles p
      where p.created_at >= p_start and p.created_at < p_end
    ),
    'created', (
      select count(*) from public.listings l
      where l.created_at >= p_start and l.created_at < p_end
    ),
    'published', (
      select count(*) from public.listings l
      where l.published_at >= p_start and l.published_at < p_end
    ),
    'publishers', (
      select count(distinct l.owner_id) from public.listings l
      where l.published_at >= p_start and l.published_at < p_end
    ),
    'views', (
      select count(*) from public.listing_events e
      where e.kind = 'view' and e.created_at >= p_start and e.created_at < p_end
    ),
    'taps', (
      select count(*) from public.listing_events e
      where e.kind = 'wa' and e.created_at >= p_start and e.created_at < p_end
    ),
    'reads', (
      select count(*) from public.listing_events e
      where e.kind = 'scroll_75' and e.created_at >= p_start and e.created_at < p_end
    ),
    'shares', (
      select count(*) from public.listing_events e
      where e.kind = 'share' and e.created_at >= p_start and e.created_at < p_end
    ),
    'visits', (
      select coalesce(sum(v.views), 0) from public.site_page_views v
      where v.day between p_from and p_to
    ),
    'editors', (
      select count(distinct e.user_id) from public.editor_events e
      where e.created_at >= p_start and e.created_at < p_end
    ),
    'paywall', (
      select count(*) from public.billing_events b
      where b.event in ('paywall_shown', 'free_limit_hit')
        and b.created_at >= p_start and b.created_at < p_end
    ),
    'payments', (
      select count(*) from public.billing_events b
      where b.event = 'payment_succeeded'
        and b.created_at >= p_start and b.created_at < p_end
    ),
    'median_minutes_to_publish', (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from (l.published_at - l.created_at)) / 60
      ))::numeric, 1)
      from public.listings l
      where l.published_at >= p_start and l.published_at < p_end
        and l.published_at >= l.created_at
    )
  );
$$;

revoke all on function public.admin_analytics_totals(timestamptz, timestamptz, date, date) from public, anon, authenticated;

create or replace function public.admin_analytics(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  cur_from date;
  prev_from date;
  cur_start timestamptz;
  prev_start timestamptz;
  cur_end timestamptz;
  steps constant text[] := array[
    'category', 'details', 'photos', 'rooms', 'plate', 'consent',
    'facts', 'disclosures', 'description', 'template', 'preview', 'publish'
  ];
  series jsonb;
  funnel jsonb;
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  cur_from := today - days + 1;
  prev_from := today - 2 * days + 1;
  cur_start := cur_from::timestamp at time zone 'Asia/Jerusalem';
  prev_start := prev_from::timestamp at time zone 'Asia/Jerusalem';
  cur_end := (today + 1)::timestamp at time zone 'Asia/Jerusalem';

  with d as (
    select g::date as day from generate_series(cur_from, today, interval '1 day') g
  ),
  s as (
    select (p.created_at at time zone 'Asia/Jerusalem')::date as day, count(*) as n
    from public.profiles p
    where p.created_at >= cur_start and p.created_at < cur_end
    group by 1
  ),
  c as (
    select (l.created_at at time zone 'Asia/Jerusalem')::date as day, count(*) as n
    from public.listings l
    where l.created_at >= cur_start and l.created_at < cur_end
    group by 1
  ),
  pb as (
    select (l.published_at at time zone 'Asia/Jerusalem')::date as day, count(*) as n
    from public.listings l
    where l.published_at >= cur_start and l.published_at < cur_end
    group by 1
  ),
  ev as (
    select
      (e.created_at at time zone 'Asia/Jerusalem')::date as day,
      count(*) filter (where e.kind = 'view') as views,
      count(*) filter (where e.kind = 'wa') as taps
    from public.listing_events e
    where e.created_at >= cur_start and e.created_at < cur_end
    group by 1
  ),
  v as (
    select sv.day, sum(sv.views) as n
    from public.site_page_views sv
    where sv.day between cur_from and today
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'day', d.day,
    'signups', coalesce(s.n, 0),
    'created', coalesce(c.n, 0),
    'published', coalesce(pb.n, 0),
    'views', coalesce(ev.views, 0),
    'taps', coalesce(ev.taps, 0),
    'visits', coalesce(v.n, 0)
  ) order by d.day)
  into series
  from d
  left join s on s.day = d.day
  left join c on c.day = d.day
  left join pb on pb.day = d.day
  left join ev on ev.day = d.day
  left join v on v.day = d.day;

  -- Distinct people per step. "stopped" is everyone who did not publish in
  -- the window, at the furthest step they reached: a per-step drop would
  -- blame 'rooms' for every car and 'plate' for every flat.
  with e as (
    select x.user_id, x.step, x.kind, array_position(steps, x.step) as pos
    from public.editor_events x
    where x.created_at >= cur_start and x.created_at < cur_end
  ),
  people as (
    select
      e.user_id,
      max(e.pos) filter (where e.kind in ('enter', 'blocked')) as furthest,
      bool_or(e.kind = 'publish_ok') as published
    from e
    group by e.user_id
  )
  select jsonb_agg(jsonb_build_object(
    'step', st.step,
    'entered', (select count(distinct e.user_id) from e where e.step = st.step and e.kind = 'enter'),
    'blocked', (select count(distinct e.user_id) from e where e.step = st.step and e.kind = 'blocked'),
    'publish_ok', (select count(distinct e.user_id) from e where e.step = st.step and e.kind = 'publish_ok'),
    'publish_fail', (select count(distinct e.user_id) from e where e.step = st.step and e.kind = 'publish_fail'),
    'stopped', (select count(*) from people p where not p.published and p.furthest = st.ord)
  ) order by st.ord)
  into funnel
  from unnest(steps) with ordinality as st(step, ord);

  return jsonb_build_object(
    'days', days,
    'from', cur_from,
    'to', today,
    'current', public.admin_analytics_totals(cur_start, cur_end, cur_from, today),
    'previous', public.admin_analytics_totals(prev_start, cur_start, prev_from, cur_from - 1),
    'series', coalesce(series, '[]'::jsonb),
    'funnel', coalesce(funnel, '[]'::jsonb),
    'status', coalesce((
      select jsonb_object_agg(x.status, x.n)
      from (select l.status, count(*) as n from public.listings l group by l.status) x
    ), '{}'::jsonb),
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'accounts', x.accounts, 'new', x.fresh) order by x.accounts desc)
      from (
        select
          coalesce(p.account_kind, 'unknown') as kind,
          count(*) as accounts,
          count(*) filter (where p.created_at >= cur_start and p.created_at < cur_end) as fresh
        from public.profiles p
        group by 1
      ) x
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', x.category, 'created', x.created, 'published', x.published) order by x.created desc)
      from (
        select
          l.category,
          count(*) filter (where l.created_at >= cur_start and l.created_at < cur_end) as created,
          count(*) filter (where l.published_at >= cur_start and l.published_at < cur_end) as published
        from public.listings l
        group by l.category
      ) x
      where x.created > 0 or x.published > 0
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object('template', x.template, 'published', x.n) order by x.n desc)
      from (
        select l.template, count(*) as n
        from public.listings l
        where l.published_at >= cur_start and l.published_at < cur_end
        group by l.template
        order by count(*) desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'top_listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', x.slug, 'category', x.category, 'template', x.template, 'status', x.status,
        'views', x.views, 'taps', x.taps, 'reads', x.reads
      ) order by x.views desc, x.taps desc)
      from (
        select l.slug, l.category, l.template, l.status,
          count(*) filter (where e.kind = 'view') as views,
          count(*) filter (where e.kind = 'wa') as taps,
          count(*) filter (where e.kind = 'scroll_75') as reads
        from public.listing_events e
        join public.listings l on l.id = e.listing_id
        where e.created_at >= cur_start and e.created_at < cur_end
        group by l.id
        order by count(*) filter (where e.kind = 'view') desc, count(*) filter (where e.kind = 'wa') desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'top_pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', x.path, 'views', x.n) order by x.n desc, x.path)
      from (
        select sv.path, sum(sv.views) as n
        from public.site_page_views sv
        where sv.day between cur_from and today
        group by sv.path
        order by sum(sv.views) desc, sv.path
        limit 15
      ) x
    ), '[]'::jsonb),
    'top_sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'views', x.n) order by x.n desc, x.source)
      from (
        select sv.source, sum(sv.views) as n
        from public.site_page_views sv
        where sv.day between cur_from and today
        group by sv.source
        order by sum(sv.views) desc, sv.source
        limit 10
      ) x
    ), '[]'::jsonb),
    'billing', coalesce((
      select jsonb_object_agg(x.event, x.n)
      from (
        select b.event, count(*) as n
        from public.billing_events b
        where b.created_at >= cur_start and b.created_at < cur_end
        group by b.event
      ) x
    ), '{}'::jsonb)
  );
end;
$$;

comment on function public.admin_analytics(integer) is
  'Admin-only analytics for the data page: totals for the period and the one before, per-day series, the editor funnel by person, mixes and top lists. Counts only, no personal data (0042).';

revoke all on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated;
