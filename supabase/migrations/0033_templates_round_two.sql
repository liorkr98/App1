-- Twenty-one templates. The six round-two picks from the prototype join
-- (היעד 2.0, P4): heliograph, walk, poster, zine, dossier, ticket. Each is
-- built on one thing only its listing has — its sun, its walk, its numbers,
-- its paperwork. TEMPLATE_IDS in src/types/listing.ts is the source of truth;
-- this check must name the same set (src/features/templates/manifest.test.ts
-- reads it).
--
-- Category rules (dossier: vehicles; heliograph, walk: properties) live in
-- the manifest, not here — the page draws the wrong category as its fallback
-- rather than a save failing after a category change.

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
    'ticket'
  ));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree. Retired ids, successors and category rules: src/features/templates/manifest.ts.';
