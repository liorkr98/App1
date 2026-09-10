-- Agents, and the listing's audience.
--
-- 0001 gave `profiles` a display name, an avatar and a locale, which is what a
-- generic app needs. This product's primary user is a licensed estate agent
-- (CLAUDE.md §1), and an agent's page carries their agency, their phone and
-- their licence — the agent bar above the hero and the seller block below it
-- both read from here.

-- ---------------------------------------------------------------------------
-- profiles: the agent's own details
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- E.164 or local Israeli form. The wa.me link on every listing is built from
  -- this, so it is the one field whose absence breaks the page's only action.
  add column if not exists phone text,

  -- Absent for a private seller. Its presence is what makes the agent bar show
  -- an agency rather than נבנה בסיבוב, so it is also the free/paid tier signal
  -- the page reads (§8).
  add column if not exists agency_name text,
  add column if not exists agency_logo_url text,

  -- Hebrew role line under the name, e.g. מתווך מורשה.
  add column if not exists role text,

  -- The Justice Ministry register lists 22,995 licensed brokers with their
  -- licence numbers. Stored so a listing can eventually SHOW it — an agent
  -- whose licence is checkable is the same trust argument the provenance
  -- model makes about the data.
  --
  -- Not verified against the register here. Storing a number is not the same
  -- as confirming it, and a page must never imply the second from the first.
  add column if not exists licence_number text;

comment on column public.profiles.licence_number is
  'Self-declared. NOT verified against the Justice Ministry register.';

-- No new policies. The four in 0001 are per-operation and column-agnostic, so
-- they already cover these: a user reads, inserts, updates and deletes only
-- the row whose id is their own.

-- ---------------------------------------------------------------------------
-- listings: who the listing is aimed at
-- ---------------------------------------------------------------------------

alter table public.listings
  -- A resident scans rooms and floor; an investor scans area, because price
  -- per m² is what they compare and area is its denominator. The facts grid
  -- reorders on this. Defaults to the commoner case rather than being
  -- required — a seller who skips the question still gets a correct page.
  add column if not exists audience text not null default 'resident'
    check (audience in ('resident', 'investor'));

comment on column public.listings.audience is
  'Reorders the facts grid. See orderForAudience in the shared domain.';

-- ---------------------------------------------------------------------------
-- The profile row has to exist before a listing can carry a seller
-- ---------------------------------------------------------------------------
--
-- 0001 creates a profile by trigger on signup. This backfills anyone who
-- signed up before that trigger existed, so a first sign-in during
-- development does not land on a page with no profile to read.

insert into public.profiles (id)
select id from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;
