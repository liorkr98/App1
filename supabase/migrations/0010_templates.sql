-- The three templates, renamed to mean something.
--
-- 0002 shipped `clean`, `gallery`, `luxury`. None of the three did anything:
-- `listings.template` was written by the editor, stored here, and READ BY
-- NOTHING. All three produced a byte-identical page, so the picker in /new was
-- asking a seller to choose between three names for one design.
--
-- The pivot of 11 September 2026 makes "a professional page, a few ways" part
-- of the product rather than a decoration, so the templates become real and
-- their names describe what they look like:
--
--   agency     light, structured, orange-accented. The busiest of the three.
--   editorial  the current design — plaster ground, serif numbers, quiet.
--   dark       inverted, photograph-led, for listings whose photos carry it.
--
-- The old names could have been kept and given new meanings. They were not,
-- because `luxury` describing a dark template is the kind of mismatch that
-- costs someone an hour a year from now.

-- ---------------------------------------------------------------------------
-- Migrate the values before the constraint that would reject them
-- ---------------------------------------------------------------------------
--
-- The constraint is dropped first: an UPDATE to a value the old check forbids
-- fails while it is still in force, and an ALTER that adds the new check fails
-- while old values are still in the column. Drop, rewrite, re-add.

alter table public.listings
  drop constraint if exists listings_template_check;

update public.listings
set template = case template
  when 'clean' then 'editorial'
  when 'gallery' then 'agency'
  when 'luxury' then 'dark'
  else template
end
where template in ('clean', 'gallery', 'luxury');

alter table public.listings
  alter column template set default 'editorial';

alter table public.listings
  add constraint listings_template_check
  check (template in ('agency', 'editorial', 'dark'));

comment on column public.listings.template is
  'Drives a data-template attribute on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree.';
