-- Listing grants, site admins, and a publish trigger.
--
-- ============================ HUMAN REVIEW ============================
-- CLAUDE.md §8. This migration is an entitlement system. A row in
-- listing_grants is what lets an agent publish. The BEFORE UPDATE trigger
-- is the server-side gate: flipping status to 'published' without a live
-- grant with remaining > 0 raises, and a successful publish decrements
-- remaining. The editor's canPublish is UX; this is the law.
--
-- FAIL CLOSED. Missing grant, expired grant, remaining = 0, or a read
-- the client cannot complete: unpaid / unknown. Never grant on timeout.
-- Admin comps are dated quotas with granted_by and a required note. A
-- later failed PSP webhook must not wipe them — there is no DELETE, and
-- close means setting effective_to.
--
-- Email addresses do not belong in this file. Seed with
-- docs/ADMIN-SEED.sql against a uuid looked up in the dashboard.
-- ======================================================================

-- ---------------------------------------------------------------------------
-- site_admins — who may grant. No email column.
-- ---------------------------------------------------------------------------

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

comment on table public.site_admins is
  'Operators who may issue listing_grants. Identity is a uuid, never an email in git. CLAUDE.md §8.';

alter table public.site_admins enable row level security;

-- An operator may see that they themselves are an admin. They may not list
-- the table, and they may not write.
create policy "site_admins_select_own"
  on public.site_admins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_admins a
    where a.user_id = (select auth.uid())
  );
$$;

comment on function public.is_site_admin() is
  'True when the current jwt is in site_admins. Used by grant RPCs and admin RLS. CLAUDE.md §8.';

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- listing_grants — dated listing quotas. Never DELETE; close with effective_to.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  remaining integer not null check (remaining >= 0),
  -- admin_comp today; psp:<id> later. A failed webhook must not look here
  -- and wipe a human grant.
  source text not null,
  granted_by uuid references auth.users (id) on delete set null,
  note text not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  constraint listing_grants_source_check
    check (source = 'admin_comp' or source like 'psp:%'),
  constraint listing_grants_note_check
    check (char_length(btrim(note)) >= 3),
  constraint listing_grants_window_check
    check (effective_to is null or effective_to > effective_from)
);

comment on table public.listing_grants is
  'Publish entitlement as a dated listing quota. Decrement on publish. Never delete; close with effective_to. CLAUDE.md §8.';

create index if not exists listing_grants_user_live_idx
  on public.listing_grants (user_id)
  where remaining > 0;

alter table public.listing_grants enable row level security;

-- An agent may see THEIR remaining quota. They may not see anyone else's,
-- and they may not write.
create policy "listing_grants_select_own"
  on public.listing_grants
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "listing_grants_select_admin"
  on public.listing_grants
  for select
  to authenticated
  using (public.is_site_admin());

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY FOR CLIENTS.
-- Writes go through admin_grant_listings (admins) or the publish trigger
-- (decrement remaining).

-- Carry existing beta allowlist members so they keep publishing. Quota is
-- generous because the old table was a boolean, not a count.
insert into public.listing_grants (user_id, remaining, source, note)
select
  b.user_id,
  50,
  'admin_comp',
  coalesce(nullif(btrim(b.note), ''), 'migrated from beta_publishers')
from public.beta_publishers b
where not exists (
  select 1 from public.listing_grants g where g.user_id = b.user_id
);

-- ---------------------------------------------------------------------------
-- Publish trigger — the real gate.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_publish_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.status = 'published'
     and old.status is distinct from 'published' then
    select g.id into grant_id
    from public.listing_grants g
    where g.user_id = new.owner_id
      and g.remaining > 0
      and g.effective_from <= now()
      and (g.effective_to is null or g.effective_to > now())
    order by g.effective_from, g.created_at
    for update
    limit 1;

    if grant_id is null then
      raise exception 'publish requires an unexpired listing grant'
        using errcode = 'P0001';
    end if;

    update public.listing_grants g
    set remaining = g.remaining - 1
    where g.id = grant_id;
  end if;

  return new;
end;
$$;

comment on function public.enforce_publish_grant() is
  'Consumes one listing grant when status becomes published. Raises if none is live. CLAUDE.md §8.';

drop trigger if exists listings_enforce_publish_grant on public.listings;

create trigger listings_enforce_publish_grant
  before update on public.listings
  for each row
  execute function public.enforce_publish_grant();

-- ---------------------------------------------------------------------------
-- Admin RPCs. is_site_admin() first. No client INSERT on grants or admins.
-- ---------------------------------------------------------------------------

create or replace function public.admin_find_user(p_email text)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  if p_email is null or btrim(p_email) = '' then
    return;
  end if;

  return query
    select u.id, u.email::text
    from auth.users u
    where lower(u.email) = lower(btrim(p_email))
    limit 1;
end;
$$;

comment on function public.admin_find_user(text) is
  'Admin-only lookup of auth.users by email. Returns nothing to non-admins (raises).';

revoke all on function public.admin_find_user(text) from public, anon;
grant execute on function public.admin_find_user(text) to authenticated;

create or replace function public.admin_grant_listings(
  p_user_id uuid,
  p_count integer,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_id uuid;
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user required' using errcode = '22023';
  end if;

  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'count must be between 1 and 100' using errcode = '22023';
  end if;

  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;

  insert into public.listing_grants (user_id, remaining, source, granted_by, note)
  values (p_user_id, p_count, 'admin_comp', (select auth.uid()), btrim(p_note))
  returning id into grant_id;

  return grant_id;
end;
$$;

comment on function public.admin_grant_listings(uuid, integer, text) is
  'Admin-only listing grant. Required note. Does not accept an email; look the uuid up first.';

revoke all on function public.admin_grant_listings(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_listings(uuid, integer, text) to authenticated;
