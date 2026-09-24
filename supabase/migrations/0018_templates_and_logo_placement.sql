-- Five templates, default agency, and logo placement presets.
--
-- The listing page still differs between property and vehicle in exactly
-- four ways (DESIGN-CONTRACT §5). Templates are data-template on <html>.
-- walkFirst and brochure are new; agency becomes the default for drafts.

alter table public.listings
  drop constraint if exists listings_template_check;

alter table public.listings
  alter column template set default 'agency';

alter table public.listings
  add constraint listings_template_check
  check (template in ('agency', 'editorial', 'dark', 'walkFirst', 'brochure'));

comment on column public.listings.template is
  'data-template on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree.';

-- Logo placement is a profile preset, stamped onto seller jsonb at publish
-- the same way the accent is. No freeform CSS.
alter table public.profiles
  add column if not exists logo_placement text not null default 'bar';

alter table public.profiles
  drop constraint if exists profiles_logo_placement_check;

alter table public.profiles
  add constraint profiles_logo_placement_check
  check (logo_placement in ('bar', 'barWide', 'footerOnly', 'watermark'));

comment on column public.profiles.logo_placement is
  'Where the agency mark sits on a listing: bar, barWide, footerOnly, watermark. Previewed on /me/.';
