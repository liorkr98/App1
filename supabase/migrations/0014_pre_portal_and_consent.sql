-- Pre-portal badge and a stored owner-consent record.
--
-- pre_portal is a SELLER DECLARATION, default false. Showing "עדיין לא
-- בלוחות" without the agent ticking it would be a claim we invented
-- (DESIGN-BRIEF §5). The public page and the WhatsApp message both read
-- this column; neither infers it.
--
-- owner_consent_* is the property-side record OPPORTUNITIES.md §1d asked
-- for: a dated declaration, with an optional owner name. The timestamp
-- already gated publish in the editor; without these columns it died with
-- the tab. Name is optional on purpose — a required field the seller cannot
-- answer is a form they abandon (PRD §2).
--
-- No new table, so the existing listings RLS policies cover both. SELECT
-- public still only sees published/sold rows (0002).

alter table public.listings
  add column if not exists pre_portal boolean not null default false;

alter table public.listings
  add column if not exists owner_consent_declared_at timestamptz;

alter table public.listings
  add column if not exists owner_consent_name text;

comment on column public.listings.pre_portal is
  'Seller declaration that the listing is not yet on commercial portals. Default false — never inferred.';

comment on column public.listings.owner_consent_declared_at is
  'When the seller declared they own the property or are authorised to list it. Property only.';

comment on column public.listings.owner_consent_name is
  'Optional name of the owner named in that declaration. Not rendered on the public page.';

-- Published and sold listings must not be hard-deleted by the owner
-- (7-year retention / OPPORTUNITIES.md). Soft-archive is the path.
-- Drafts may still be deleted. Auth-user cascade still removes every
-- row on account deletion — that bypasses RLS.
drop policy if exists "listings_delete_own" on public.listings;

create policy "listings_delete_own_drafts"
  on public.listings
  for delete
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'draft'
  );
