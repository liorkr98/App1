-- Seven templates. linen and studio join the five from 0018.
-- TEMPLATE_IDS in src/types/listing.ts is the source of truth; this check
-- must name the same set.

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
    'studio'
  ));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree.';
