-- Civic sites from data.gov.il: police desks (WGS84) and parking (ITM).
--
-- Walking time is still OSRM at publish. This table is only coordinates.
-- nearby_candidates grows a civic union; pages never query CKAN at render.

create table if not exists public.civic_sites (
  site_id text primary key,
  name text not null,
  kind text not null check (kind in ('police', 'parking', 'park_ride')),
  geom geography(Point, 4326) not null,
  updated_at timestamptz not null default now()
);

comment on table public.civic_sites is
  'Police reception units and public parking from data.gov.il. Not OSM. Ingest only.';

create index if not exists civic_sites_geom on public.civic_sites using gist (geom);
create index if not exists civic_sites_kind on public.civic_sites (kind);

alter table public.civic_sites enable row level security;

create policy civic_sites_select_public on public.civic_sites for select using (true);
-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
grant select on table public.civic_sites to anon, authenticated, service_role;

insert into public.source_sync (source, display_name, attribution) values
  ('police', 'משטרת ישראל', null),
  ('parking', 'מפ״י', null),
  ('park_ride', 'משרד התחבורה', null)
on conflict (source) do nothing;

-- ITM (EPSG:2039) → WGS84. Parking and park-and-ride publish X/Y in metres,
-- not lat/long. Conversion stays in PostGIS so we do not add a proj package.
create or replace function public.upsert_civic_itm(p_rows jsonb)
returns integer
language plpgsql
security definer
-- public + extensions: PostGIS lives in extensions on hosted Postgres, and
-- st_transform must resolve. An empty search_path would throw at ingest.
set search_path = public, extensions
as $$
declare
  written int := 0;
begin
  insert into public.civic_sites (site_id, name, kind, geom)
  select
    r.site_id,
    r.name,
    r.kind,
    r.geom
  from (
    select
      trim(elem->>'site_id') as site_id,
      trim(elem->>'name') as name,
      trim(elem->>'kind') as kind,
      st_transform(
        st_setsrid(
          st_makepoint((elem->>'x')::double precision, (elem->>'y')::double precision),
          2039
        ),
        4326
      )::geography as geom
    from jsonb_array_elements(p_rows) as elem
  ) r
  where r.site_id <> ''
    and r.name <> ''
    and r.kind in ('police', 'parking', 'park_ride')
    and st_x(r.geom::geometry) > 34.2
    and st_x(r.geom::geometry) < 35.9
    and st_y(r.geom::geometry) > 29.4
    and st_y(r.geom::geometry) < 33.4
  on conflict (site_id) do update
    set name = excluded.name,
        kind = excluded.kind,
        geom = excluded.geom,
        updated_at = now();

  get diagnostics written = row_count;
  return written;
end;
$$;

comment on function public.upsert_civic_itm(jsonb) is
  'Service-role ingest of ITM civic rows. Converts 2039→4326. Not callable by anon.';

revoke all on function public.upsert_civic_itm(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_civic_itm(jsonb) to service_role;

create or replace function public.nearby_candidates(
  p_lat double precision,
  p_lon double precision,
  p_radius_metres integer default 1800,
  p_limit_per_kind integer default 60
)
returns table (
  kind text,
  id text,
  name text,
  lon double precision,
  lat double precision,
  metres double precision,
  attr_a text,
  attr_b text,
  attr_c text
)
language sql
stable
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as g
  ),
  t as (
    select
      'transit'::text as kind,
      s.stop_id as id,
      s.name,
      st_x(s.geom::geometry) as lon,
      st_y(s.geom::geometry) as lat,
      st_distance(s.geom, o.g) as metres,
      s.mode as attr_a,
      array_to_string(s.routes, ',') as attr_b,
      null::text as attr_c
    from public.transit_stops s, origin o
    where st_dwithin(s.geom, o.g, p_radius_metres)
    order by metres
    limit p_limit_per_kind
  ),
  sc as (
    select
      'school'::text,
      s.semel_mosad,
      s.name,
      st_x(s.geom::geometry),
      st_y(s.geom::geometry),
      st_distance(s.geom, o.g),
      coalesce(s.type, ''),
      coalesce(s.stream, ''),
      nullif(trim(coalesce(s.grade_from, '') || '–' || coalesce(s.grade_to, '')), '–')
    from public.schools s, origin o
    where st_dwithin(s.geom, o.g, p_radius_metres)
    order by st_distance(s.geom, o.g)
    limit p_limit_per_kind
  ),
  pl as (
    select
      'place'::text,
      p.osm_id,
      p.name,
      st_x(p.geom::geometry),
      st_y(p.geom::geometry),
      st_distance(p.geom, o.g),
      p.category,
      null::text,
      null::text
    from public.places p, origin o
    where st_dwithin(p.geom, o.g, p_radius_metres)
    order by st_distance(p.geom, o.g)
    limit p_limit_per_kind * 3
  ),
  ci as (
    select
      'civic'::text,
      c.site_id,
      c.name,
      st_x(c.geom::geometry),
      st_y(c.geom::geometry),
      st_distance(c.geom, o.g),
      c.kind,
      null::text,
      null::text
    from public.civic_sites c, origin o
    where st_dwithin(c.geom, o.g, p_radius_metres)
    order by st_distance(c.geom, o.g)
    limit p_limit_per_kind
  )
  select * from t
  union all select * from sc
  union all select * from pl
  union all select * from ci;
$$;

revoke all on function public.nearby_candidates(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.nearby_candidates(double precision, double precision, integer, integer)
  to service_role;
