-- Four more templates.
--
-- 0010 made the three real and pinned the CHECK constraint to their names.
-- That constraint is why this file exists at all: TEMPLATE_IDS in
-- src/types/listing.ts is the list the picker and the draft validator read,
-- but the database is what refuses the insert, and a template that exists in
-- TypeScript and not here fails at PUBLISH — after the seller has done the
-- work, in production, with nothing in the editor to explain it.
--
-- The four, and the reader each is for:
--
--   sheet    a printed property sheet. Rules, ruled rows, nothing rounded.
--            The only template that does not get worse when the photographs
--            are ordinary, which describes most listings.
--   poster   one photograph at full height with the price and facts as an
--            inverted caption band under it. Built to survive being
--            screenshotted into a WhatsApp Status, which research found is
--            an image surface rather than a link one.
--   ledger   numbers before photograph, on a hairline grid. For the reader
--            comparing ₪ per m² between listings — the same reader
--            `audience = 'investor'` (0009) already knows about.
--   warm     one column of large rounded photographs, more leading, the
--            seller promoted. The private seller's template; every other one
--            is agent-shaped.
--
-- Same drop-and-re-add shape as 0010: a constraint cannot be widened in
-- place, and no existing row changes value, so there is no UPDATE here.

alter table public.listings
  drop constraint if exists listings_template_check;

alter table public.listings
  add constraint listings_template_check
  check (template in ('agency', 'editorial', 'dark', 'sheet', 'poster', 'ledger', 'warm'));

comment on column public.listings.template is
  'Drives a data-template attribute on the listing page. See TEMPLATE_IDS in src/types/listing.ts — the two lists must agree, and this constraint is what enforces it at publish.';
