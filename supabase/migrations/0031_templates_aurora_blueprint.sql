-- Eleven templates. Aurora replaces cinema; Blueprint is new (היעד 2.0, P3).
-- TEMPLATE_IDS in src/types/listing.ts is the source of truth; this check
-- must name the same set (src/features/templates/manifest.test.ts reads it).
--
-- Aurora is cinema rebuilt on Living Surfaces, so every cinema row moves to
-- it. The code also resolves 'cinema' to 'aurora' (LEGACY_TEMPLATE_ALIASES),
-- which is what makes the order safe: deploy the code first, then apply this.
--
-- Changing template does not touch status, so the publish gate in
-- 0016/0022 (draft→published only) does not fire.

update public.listings
  set template = 'aurora'
  where template = 'cinema';

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
    'blueprint'
  ));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree. Retired ids and their successors: src/features/templates/manifest.ts.';
