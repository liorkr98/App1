-- Fifteen templates. Monolith, Atelier, Glass and Showroom join (היעד 2.0,
-- P3, the round-one picks from the prototype). TEMPLATE_IDS in
-- src/types/listing.ts is the source of truth; this check must name the same
-- set (src/features/templates/manifest.test.ts reads it).
--
-- Showroom is for vehicles. The column does not enforce that — a category
-- change after the template was chosen would otherwise fail an ordinary
-- save — so the page decides: templateFor() in the manifest draws a
-- property that asks for Showroom as Aurora.

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
    'showroom'
  ));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree. Retired ids, successors and category rules: src/features/templates/manifest.ts.';
