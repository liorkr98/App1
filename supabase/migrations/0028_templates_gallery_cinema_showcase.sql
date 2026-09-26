-- Ten templates. gallery, cinema and showcase join the seven from 0027.
-- TEMPLATE_IDS in src/types/listing.ts is the source of truth; this check
-- must name the same set.
--
-- These three differ from the first seven in markup, not only in tokens:
-- a photo mosaic, a full-bleed cinema head and a showcase card. The column
-- still stores one word, and the page still selects on data-template.

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
    'cinema',
    'showcase'
  ));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree.';
