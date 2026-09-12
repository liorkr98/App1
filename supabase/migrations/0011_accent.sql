-- The agent's accent colour.
--
-- 0010 shipped three templates, one of which was accented orange while the
-- other two were olive. That gave the product two brand colours depending on
-- which template a listing happened to use, which is not a palette — it is an
-- inconsistency the agent did not ask for.
--
-- Orange is gone. Every template is olive by default, and the accent is now
-- something the AGENT chooses once and carries across all three templates and
-- every listing they make. Same argument as the agency name: an agent's pages
-- should look like each other, and the way to guarantee that is to ask once.
--
-- The six are defined in src/features/agents/accents.ts, with the contrast of
-- each pair asserted by accents.test.ts rather than trusted. None of them is
-- blue — CLAUDE.md §2, and the test enforces it.

-- ---------------------------------------------------------------------------
-- profiles: the agent's choice
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists accent text not null default 'olive';

alter table public.profiles
  drop constraint if exists profiles_accent_check;

alter table public.profiles
  add constraint profiles_accent_check
  check (accent in ('olive', 'forest', 'clay', 'wine', 'ochre', 'charcoal'));

comment on column public.profiles.accent is
  'The agent''s accent, stamped onto each listing they create. See ACCENTS in src/features/agents/accents.ts — the two lists must agree.';

-- ---------------------------------------------------------------------------
-- listings: the accent this page was published with
-- ---------------------------------------------------------------------------
--
-- A COPY, not a join to profiles, for the same reason `seller` is a copy: an
-- agent who changes their colour next year must not silently repaint the
-- twelve pages they already sent. Those pages record what was true when they
-- were published.

alter table public.listings
  add column if not exists accent text not null default 'olive';

alter table public.listings
  drop constraint if exists listings_accent_check;

alter table public.listings
  add constraint listings_accent_check
  check (accent in ('olive', 'forest', 'clay', 'wine', 'ochre', 'charcoal'));

comment on column public.listings.accent is
  'Stamped from the agent profile at draft time. Never re-read from profiles — see 0011.';

-- No new policies. The per-operation policies in 0001 and 0002 are
-- column-agnostic and already cover both of these.
