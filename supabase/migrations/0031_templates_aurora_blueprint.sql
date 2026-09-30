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

-- The old check goes first: it does not allow aurora or brochure, so the
-- updates below would violate it (found applying this to the live database).
alter table public.listings
  drop constraint if exists listings_template_check;

update public.listings
  set template = 'aurora'
  where template = 'cinema';

-- The live database took a migration on 26 Sept 2026 that is not in this
-- repo ("templates_that_differ"). It renamed brochure → postcard and
-- studio → portrait and allowed two more ids, ledger and stack, that no code
-- here knows. The code falls back to agency for all four. Rows go back to the
-- id they held before that migration; the two with no predecessor go to the
-- default. The check below would reject any of them otherwise.
update public.listings
  set template = case template
    when 'postcard' then 'brochure'
    when 'portrait' then 'studio'
    else 'agency'
  end
  where template in ('postcard', 'portrait', 'ledger', 'stack');

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
