-- Candidate selection for proximity enrichment.
--
-- This function does the SPATIAL half only: everything within a generous
-- radius, cheaply, using the GiST indexes from 0007. It deliberately does NOT
-- decide what is "within walking distance" — that is a routed question, and
-- OSRM answers it in the ingestion job afterwards.
--
-- The split matters. Straight-line radius is what an index can answer in
-- milliseconds; routed time is what is true. Doing the cheap filter here and
-- the honest one there is what makes the whole thing affordable.

create or replace function public.nearby_candidates(
  p_lat double precision,
  p_lon double precision,
  p_radius_metres integer default 1800,
  -- Per-kind ceiling. A dense Tel Aviv corner has hundreds of restaurants
  -- inside the radius and routing all of them is waste: the nearest few by
  -- straight line will contain the nearest few by foot, with room to spare.
  p_limit_per_kind integer default 60
)
returns table (
  kind text,
  id text,
  name text,
  lon double precision,
  lat double precision,
  -- Straight-line, for ordering candidates only. NEVER displayed: it is the
  -- number this whole design exists to avoid showing anyone.
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
      -- Grade span assembled here so the caller never has to know the two
      -- columns exist. Kindergartens have neither and get an empty string.
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
    -- Places are the dense category, so they get a larger share.
    limit p_limit_per_kind * 3
  )
  select * from t
  union all select * from sc
  union all select * from pl;
$$;

comment on function public.nearby_candidates(double precision, double precision, integer, integer) is
  'Straight-line candidates within a radius. Walking time is decided by OSRM, not here.';

-- Ingestion runs as the service role. Anonymous and signed-in users have no
-- reason to call this: it takes an arbitrary coordinate and would let anyone
-- use our database as a free proximity API.
revoke all on function public.nearby_candidates(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.nearby_candidates(double precision, double precision, integer, integer)
  to service_role;
