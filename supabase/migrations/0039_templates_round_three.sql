-- Twenty-five templates. Round three (12 Oct 2026) adds four, picked by the
-- owner from fourteen sketches, each with ONE signature motion: prints (three
-- photographs as prints on a table, parallax), keytag (a key tag over the
-- photograph that sways), streetsign (the street plate over the photograph,
-- homes) and dashboard (gauges and an odometer that roll up, cars). TEMPLATE_IDS in src/types/listing.ts is the source of truth; this
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
    'prints',
    'keytag',
    'streetsign',
    'dashboard'
  ));
