-- Initial schema for the base template.
--
-- Only `profiles` lives here. App-specific tables belong in the cloned repo,
-- never in the template (CLAUDE.md §1).
--
-- RLS is enabled on every table with an explicit policy per operation
-- (CLAUDE.md §8). A table without a policy is a data leak, and a table with
-- RLS enabled but no policy is silently unreadable — both are bugs.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  -- Hebrew is the default for this portfolio (CLAUDE.md §1).
  locale text not null default 'he' check (locale in ('he', 'en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Deleted automatically when the auth user is deleted.';

alter table public.profiles enable row level security;

-- --- Policies --------------------------------------------------------------
--
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once per
-- statement rather than once per row. On a large table the unwrapped form is a
-- measurable performance cliff.

-- A user may read only their own profile.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- A user may create only a profile whose id is their own. The trigger below
-- normally does this, but an explicit policy keeps the table safe if the
-- trigger is ever dropped.
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- A user may update only their own profile, and may not change its id to
-- someone else's — that is what the with-check clause prevents.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A user may delete only their own profile. Required by the in-app account
-- deletion that Apple mandates (CLAUDE.md §7).
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile creation on signup
-- ---------------------------------------------------------------------------
--
-- security definer because it writes to public.profiles as the trigger owner,
-- not as the signing-up user, who has no session yet. search_path is pinned to
-- the empty string so a malicious schema on the caller's path cannot hijack
-- the unqualified names inside.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
