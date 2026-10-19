-- 0047: the agent's options for one page, and a sold page they keep up (19 Oct 2026).
--
-- 1. listings.extras: what the agent turns on for this page, each off until
--    they do. Known keys only, each with its own type:
--      visit       boolean  a second WhatsApp button, to book a visit or a test drive
--      calculator  boolean  a mortgage or car loan calculator at the bottom
--      warranty    boolean  a car under warranty, as the seller declares it
--      openHouse   object   start and end, ISO 8601 with an offset, at most 8 hours
--    Anything else is refused, so a browser cannot park arbitrary data on a
--    public row.
--
-- 2. listings.sold_public: a sold listing whose page the agent keeps up, as a
--    record of the sale. Off by default, which is what 0026 decided for every
--    sold listing: it leaves the public web. With it on, the page shows the
--    sale and nothing to contact or pay; the code decides that.
--
-- 3. listings_select_public reads a sold listing only when sold_public is on.
--    Still to anon and authenticated: the dashboard and the editor filter by
--    owner themselves (scripts/sql-test/owner-reads.sql).
--
-- Plan page limits do not change: a sold page counts whether it is up or
-- not (0045).
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them.

alter table public.listings
  add column if not exists extras jsonb not null default '{}'::jsonb,
  add column if not exists sold_public boolean not null default false;

create or replace function public.listing_extras_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  iso constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$';
  open_from timestamptz;
  open_to timestamptz;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for key in select jsonb_object_keys(p) loop
    if key in ('visit', 'calculator', 'warranty') then
      if jsonb_typeof(p -> key) <> 'boolean' then
        return false;
      end if;
    elsif key = 'openHouse' then
      if jsonb_typeof(p -> key) <> 'object'
         or (select count(*) from jsonb_object_keys(p -> key)) <> 2
         or jsonb_typeof(p -> key -> 'start') is distinct from 'string'
         or jsonb_typeof(p -> key -> 'end') is distinct from 'string'
         or (p -> key ->> 'start') !~ iso
         or (p -> key ->> 'end') !~ iso
      then
        return false;
      end if;
      open_from := (p -> key ->> 'start')::timestamptz;
      open_to := (p -> key ->> 'end')::timestamptz;
      if open_to <= open_from or open_to - open_from > interval '8 hours' then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_extras_shape') then
    alter table public.listings
      add constraint listings_extras_shape check (public.listing_extras_ok(extras));
  end if;
end;
$$;

comment on column public.listings.extras is
  'The options the agent turned on for this page: visit, calculator, warranty, openHouse (0047). Known keys only.';
comment on column public.listings.sold_public is
  'A sold listing whose page stays up as a record of the sale (0047). Off by default: sold leaves the web (0026).';

drop policy if exists "listings_select_public" on public.listings;

create policy "listings_select_public"
  on public.listings
  for select
  to anon, authenticated
  using (status = 'published' or (status = 'sold' and sold_public));
