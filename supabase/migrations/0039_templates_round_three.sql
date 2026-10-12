-- Twenty-five templates. Round three (12 Oct 2026) adds four, each with ONE
-- signature motion and nothing else on the page moving: breath (the cover
-- breathes), chapters (the rooms open one by one as the page scrolls; homes),
-- depth (parallax layers) and road (the photographs drive past sideways;
-- cars). TEMPLATE_IDS in src/types/listing.ts is the source of truth; this
-- check must name the same set (src/features/templates/manifest.test.ts
-- reads it).
--
-- Category rules live in the manifest, not here (see 0033).
--
-- Safe to run twice: the constraint is dropped if it exists, then added.
-- No apostrophes in these comments: the Supabase SQL editor splits on them.

alter table public.listings
  drop constraint if exists listings_template_check;

alter table public.listings
  add constraint listings_template_check
  check (template in (
    'agency',
    'editorial',
    'dark',
    'walkFirst',
    'brochure',
    'linen',
    'studio',
    'gallery',
    'showcase',
    'aurora',
    'blueprint',
    'monolith',
    'atelier',
    'glass',
    'showroom',
    'heliograph',
    'walk',
    'poster',
    'zine',
    'dossier',
    'ticket',
    'breath',
    'chapters',
    'depth',
    'road'
  ));
