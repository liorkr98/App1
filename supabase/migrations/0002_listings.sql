-- Listings.
--
-- Stage D operates on listings, and until now the schema held only profiles.
--
-- Shape follows src/types/listing.ts. Facts and media are jsonb rather than
-- normalised tables on purpose: the fact set is category-driven and changes
-- whenever a schema file changes, and a migration per fact would make adding a
-- category expensive — which is exactly what Stage A was built to avoid.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  -- 5 characters, Crockford base32, generated server-side.
  slug text not null unique check (slug ~ '^[0-9A-HJKMNP-TV-Z]{5}$'),
  category text not null check (category in ('property', 'vehicle')),

  title text not null,
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'ILS',

  -- Presence of list_price selects the comparison form of the price note.
  list_price numeric(12, 2) check (list_price >= 0),
  price_note text,

  facts jsonb not null default '[]'::jsonb,
  media jsonb not null default '{}'::jsonb,
  disclosures text[],
  location jsonb,
  seller jsonb not null default '{}'::jsonb,

  template text not null default 'clean' check (template in ('clean', 'gallery', 'luxury')),
  status text not null default 'draft' check (status in ('draft', 'published', 'sold', 'archived')),

  -- Search indexing is the seller's decision, not ours. A private seller
  -- usually does not want their home address permanently searchable; an agent
  -- wants the organic traffic. Default closed.
  indexable boolean not null default false,

  -- Set by the generate_og job. NULL means the page falls back to the cover.
  og_image_hash text,

  published_at timestamptz,
  -- 12 months after publishing (PRD.md §5).
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.listings is
  'One row per listing. Publishable independently of processing state — see 0003_jobs.sql.';

create index listings_owner on public.listings (owner_id, updated_at desc);
create index listings_published on public.listings (status, published_at desc)
  where status in ('published', 'sold');

create trigger listings_set_updated_at
  before update on public.listings
  for each row
  execute function public.set_updated_at();

alter table public.listings enable row level security;

-- --- Policies --------------------------------------------------------------

-- An owner sees every listing of theirs, at any status, including drafts.
create policy "listings_select_own"
  on public.listings
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ANYONE, signed in or not, may read a published or sold listing.
--
-- This is deliberate and it is the product: the page is a public URL meant to
-- be opened from a WhatsApp message by someone with no account. Privacy comes
-- from the unguessable 5-character slug and from `indexable` keeping it out of
-- search — not from access control.
--
-- Drafts and archived listings are excluded, so an unfinished listing is never
-- readable by a stranger.
create policy "listings_select_public"
  on public.listings
  for select
  to anon, authenticated
  using (status in ('published', 'sold'));

-- A user may create only a listing owned by themselves.
create policy "listings_insert_own"
  on public.listings
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

-- A user may edit only their own listing, and the with-check clause stops them
-- reassigning owner_id to somebody else on the way out.
create policy "listings_update_own"
  on public.listings
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- A user may delete only their own listing.
create policy "listings_delete_own"
  on public.listings
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
