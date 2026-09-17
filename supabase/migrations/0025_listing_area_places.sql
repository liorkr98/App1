-- The named neighbours of a listing's address, as OpenStreetMap gave them.
--
-- WHAT IT HOLDS. The output of one Overpass query for the listing's street:
-- the neighbourhood name, and the named schools, transit stops, parks,
-- community facilities and shops around it. Names only — no coordinates, no
-- distances, no walking times. See src/features/listings/area-note.ts for why
-- there is not a single number in it.
--
-- WHY ON THE LISTING ROW rather than in a shared cache table keyed by street.
-- A shared cache would be written by whichever agent happened to publish
-- first, and read by everyone after them — one client able to write what
-- another client's page then says about a neighbourhood. Keeping it on the
-- listing means every write is an agent writing to their own row, under the
-- update policy that already exists, and no new trust boundary is created.
-- The cost is refetching per listing, which is one request per address.
--
-- WHY IT IS PUBLICLY READABLE. It rides on the existing select policy, which
-- is correct: this is OpenStreetMap data about a public street, and the page
-- needs it to know that it owes the ODbL credit. Nothing private is in here —
-- the address itself is already in `location`, and more visibly.
--
-- ODbL (CLAUDE.md §10). A page whose description was built from these names
-- carries the attribution. The credit travels with the data — a listing with
-- an empty `area_places` makes no claim about a source it never used — which
-- is the same rule `listing_enrichment.payload.attributions` follows.

alter table public.listings
  add column if not exists area_places jsonb not null default '{}'::jsonb;

comment on column public.listings.area_places is
  'OpenStreetMap names around the address: neighbourhood, schools, transit, parks, community, shops. Names only, no coordinates or distances. ODbL — any page using it credits OSM.';
