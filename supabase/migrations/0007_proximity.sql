-- Proximity enrichment: what is around an address.
--
-- Three sources, one shape. Everything here is written by scheduled ingestion
-- jobs and read only by the page build. Government and OSM endpoints are never
-- queried while a page renders (RESEARCH.md §4.5) — they are slow,
-- rate-limited and occasionally down, and the page has a hard performance
-- floor.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------
--
-- last_synced_at is not an operational detail. It surfaces to the page as the
-- sourceDate beside every enriched item, so staleness is something the reader
-- can judge rather than something we imply (RESEARCH.md §4.7).

create table if not exists public.source_sync (
  source text primary key,

  -- Cited by name on the page: משרד החינוך, משרד התחבורה, OpenStreetMap.
  display_name text not null,

  -- Rendered in the footer wherever this source's data appears. NULL for
  -- sources with no attribution requirement; OpenStreetMap is ODbL and must
  -- have one.
  attribution text,

  last_synced_at timestamptz,
  -- Kept separate from last_synced_at: a run that fails must not advance the
  -- date the page shows, but we still want to know it ran.
  last_attempted_at timestamptz,
  last_error text,
  row_count integer not null default 0
);

comment on table public.source_sync is
  'One row per ingestion source. last_synced_at becomes the page''s sourceDate.';

-- ---------------------------------------------------------------------------
-- Schools
-- ---------------------------------------------------------------------------
--
-- Two data.gov.il datasets joined on סמל מוסד: the institutions table carries
-- name, stream and grade span, and a companion table carries coordinates
-- (docs/DATA-SOURCES.md).
--
-- The institutions table is a PER-YEAR snapshot, so ingestion must filter to
-- the latest שנה before joining or every school appears once per year it has
-- existed.

create table if not exists public.schools (
  -- סמל מוסד. Stable across years, which is what makes the sync idempotent.
  semel_mosad text primary key,
  name text not null,
  -- Hebrew institution type, e.g. בית ספר יסודי, גן ילדים.
  type text,
  -- Supervision stream: ממלכתי, ממלכתי־דתי, חרדי.
  stream text,
  grade_from text,
  grade_to text,
  locality text,

  geom geography(Point, 4326) not null,

  -- The register's own confidence in the coordinate (RAMAT_DIYUK_MIKUM):
  -- גבוהה מאוד, גבוהה, בינונית. A "4 minute walk" computed from a medium
  -- accuracy point is precision we do not have, so the query filters on this.
  location_accuracy text,

  updated_at timestamptz not null default now()
);

create index if not exists schools_geom on public.schools using gist (geom);

-- ---------------------------------------------------------------------------
-- Transit
-- ---------------------------------------------------------------------------
--
-- Derived from the Ministry of Transport GTFS feed. We keep only what the page
-- consumes: a stop, the routes serving it, and the mode.
--
-- mode is an enum-ish text rather than the raw GTFS route_type because
-- route_type is a number whose meaning varies by feed, and because light rail
-- MUST stay distinguishable from bus — it is one of the highest-value facts on
-- a Tel Aviv page.

create table if not exists public.transit_stops (
  -- GTFS stop_id.
  stop_id text primary key,
  name text not null,
  geom geography(Point, 4326) not null,

  -- light_rail | train | metro | bus. Constrained so an unmapped route_type
  -- fails loudly at ingestion rather than silently becoming a bus.
  mode text not null check (mode in ('light_rail', 'train', 'metro', 'bus')),

  -- Route designations serving this stop. Text, because 5א and 480 both exist.
  routes text[] not null default '{}',

  updated_at timestamptz not null default now()
);

create index if not exists transit_stops_geom on public.transit_stops using gist (geom);
-- The light rail query is the one worth making fast on its own.
create index if not exists transit_stops_mode on public.transit_stops (mode);

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------
--
-- OpenStreetMap, Israel extract, filtered to the categories the page shows.
-- We do NOT import all of OSM.
--
-- ODbL: any page displaying this must carry attribution. That obligation is
-- carried in source_sync.attribution and travels with the data into the
-- enrichment payload, so a page cannot render places without it.

create table if not exists public.places (
  -- OSM type and id, e.g. node/240109189. Stable, so re-import is idempotent.
  osm_id text primary key,
  name text not null,
  category text not null check (
    category in ('restaurant', 'cafe', 'grocery', 'pharmacy', 'park', 'culture', 'gym')
  ),
  geom geography(Point, 4326) not null,
  updated_at timestamptz not null default now()
);

create index if not exists places_geom on public.places using gist (geom);
create index if not exists places_category on public.places (category);

-- ---------------------------------------------------------------------------
-- Per-listing enrichment cache
-- ---------------------------------------------------------------------------
--
-- Computed once at publish, stored, and read by the page build. Routing at
-- render time is exactly what §4.5 forbids, and OSRM is the most expensive
-- call in the system.

create table if not exists public.listing_enrichment (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  -- The geocoded coordinate the enrichment was computed from. Kept so a
  -- re-run can tell "the address moved" from "the data changed".
  geom geography(Point, 4326) not null,
  payload jsonb not null,
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- The three reference tables are public knowledge — school locations and bus
-- stops are published by the state, and OSM is open data. They are readable by
-- anyone and writable only by the ingestion jobs, which use the service role
-- and bypass RLS entirely. No write policy is defined ON PURPOSE: a user who
-- could write to `places` could put anything on anyone's page.

alter table public.schools enable row level security;
alter table public.transit_stops enable row level security;
alter table public.places enable row level security;
alter table public.source_sync enable row level security;
alter table public.listing_enrichment enable row level security;

create policy schools_select_public on public.schools for select using (true);
create policy transit_stops_select_public on public.transit_stops for select using (true);
create policy places_select_public on public.places for select using (true);
create policy source_sync_select_public on public.source_sync for select using (true);

-- Enrichment follows its listing's visibility exactly. A draft listing's
-- enrichment is not public, because it would leak the address of a property
-- the seller has not published.
create policy listing_enrichment_select on public.listing_enrichment
for select using (
  exists (
    select 1 from public.listings l
    where l.id = listing_enrichment.listing_id
      and (l.owner_id = auth.uid() or l.status in ('published', 'sold'))
  )
);

-- ---------------------------------------------------------------------------
-- Seed the source registry
-- ---------------------------------------------------------------------------
--
-- Inserted with a NULL last_synced_at: nothing has been ingested yet, and a
-- date here before the first run would be a fabricated citation.

insert into public.source_sync (source, display_name, attribution) values
  ('schools', 'משרד החינוך', null),
  ('transit', 'משרד התחבורה', null),
  ('places',  'OpenStreetMap', '© מפתחי OpenStreetMap, ברישיון ODbL')
on conflict (source) do nothing;
