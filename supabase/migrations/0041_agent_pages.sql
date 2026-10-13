-- 0041 — Agent pages (13 Oct 2026).
--
-- An agent, office or dealer can turn on a public page at /agent/{key}:
-- their name, agency, logo, a licence badge only when the register check
-- passed, and every listing they have live or sold. Each listing keeps its
-- own search setting; turning the page on is the agent's opt-in for the page
-- itself (CLAUDE.md §7: we do not decide for them).
--
-- Two addresses (the owner's choice): an automatic code, five characters in
-- the listing-slug alphabet, given once and never changed; and an optional
-- handle the agent types (noa-cohen). The page answers to both; the site
-- sends the code to the handle when there is one.
--
-- THE COLUMNS ARE NOT THE AGENT'S TO WRITE. profiles_update_own lets a person
-- update their own row, so a trigger keeps these three as they were unless
-- the functions below set agent_page.trusted for their transaction — the
-- same shape as billing.trusted in 0040. Uniqueness, the format and the
-- reserved words are checked in one place, not trusted from the browser.
--
-- Safe to run twice.

alter table public.profiles
  add column if not exists page_enabled boolean not null default false,
  add column if not exists page_code text,
  add column if not exists page_handle text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_page_code_format') then
    alter table public.profiles
      add constraint profiles_page_code_format check (page_code is null or page_code ~ '^[0-9A-HJKMNP-TV-Z]{5}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_page_handle_format') then
    alter table public.profiles
      add constraint profiles_page_handle_format
      check (page_handle is null or page_handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');
  end if;
end $$;

create unique index if not exists profiles_page_code_key on public.profiles (page_code) where page_code is not null;
create unique index if not exists profiles_page_handle_key on public.profiles (page_handle) where page_handle is not null;

comment on column public.profiles.page_enabled is 'The public agent page is on (0041). Changed only through enable_agent_page / disable_agent_page.';
comment on column public.profiles.page_code is 'The agent page''s automatic address, given once (0041).';
comment on column public.profiles.page_handle is 'The agent page''s chosen address, lower case (0041). Changed only through set_agent_handle.';

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_page()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('agent_page.trusted', true) = '1', false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.page_enabled := false;
    new.page_code := null;
    new.page_handle := null;
  else
    new.page_enabled := old.page_enabled;
    new.page_code := old.page_code;
    new.page_handle := old.page_handle;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_page on public.profiles;
create trigger profiles_protect_page
  before insert or update on public.profiles
  for each row execute function public.protect_profile_page();

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- Words a handle may not be: the site's own paths, and names that would read
-- as us. Lower case, as handles are stored.
create or replace function public.agent_handle_reserved(p_handle text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_handle = any (array[
    'a', 'about', 'accessibility', 'admin', 'agent', 'agents', 'amudsell', 'api', 'contact',
    'dealers', 'enter', 'fixtures', 'fonts', 'guide', 'guides', 'help', 'home', 'lab', 'legal',
    'login', 'me', 'mine', 'new', 'og', 'preview', 'pricing', 'private', 'privacy', 'support',
    'template-check', 'templates', 'terms', 'up', 'www'
  ]);
$$;

-- Why a handle cannot be had, or null when it can: 'format', 'reserved',
-- 'taken'. The browser shows the reason; this decides it.
create or replace function public.agent_handle_problem(p_handle text, p_self uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_handle is null or p_handle !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' then 'format'
    when public.agent_handle_reserved(p_handle) then 'reserved'
    when exists (
      select 1 from public.profiles p
      where p.page_handle = p_handle and p.id is distinct from p_self
    ) then 'taken'
    else null
  end;
$$;

create or replace function public.agent_handle_available(p_handle text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.agent_handle_problem(lower(trim(p_handle)), (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- The agent's own switches
-- ---------------------------------------------------------------------------

create or replace function public.enable_agent_page()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  kind text;
  code text;
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select p.account_kind, p.page_code into kind, code from public.profiles p where p.id = me;
  if kind is null or kind not in ('agent', 'office', 'dealer') then
    raise exception 'agent pages are for agents, offices and dealers' using errcode = '42501';
  end if;
  while code is null loop
    code := (
      select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 5)
    );
    if exists (select 1 from public.profiles p where p.page_code = code) then
      code := null;
    end if;
  end loop;
  perform pg_catalog.set_config('agent_page.trusted', '1', true);
  update public.profiles set page_enabled = true, page_code = code where id = me;
  perform pg_catalog.set_config('agent_page.trusted', '0', true);
  return code;
end;
$$;

create or replace function public.disable_agent_page()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('agent_page.trusted', '1', true);
  update public.profiles set page_enabled = false where id = me;
  perform pg_catalog.set_config('agent_page.trusted', '0', true);
end;
$$;

-- Sets or clears (null or '') the handle. Raises with the reason as the
-- message: format, reserved or taken.
create or replace function public.set_agent_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wanted text := nullif(lower(trim(coalesce(p_handle, ''))), '');
  problem text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if wanted is not null then
    problem := public.agent_handle_problem(wanted, me);
    if problem is not null then
      raise exception '%', problem using errcode = '22023';
    end if;
  end if;
  perform pg_catalog.set_config('agent_page.trusted', '1', true);
  update public.profiles set page_handle = wanted where id = me;
  perform pg_catalog.set_config('agent_page.trusted', '0', true);
  return wanted;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a stranger may read
-- ---------------------------------------------------------------------------

-- One agent page by code (five upper-case slug characters) or handle. Null
-- when there is none or it is off. Never an email or the account id.
-- Listings: live, then sold, newest first; never a draft, an archived page,
-- or a one-time page past its days.
create or replace function public.public_agent(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.page_code,
    'handle', p.page_handle,
    'name', p.display_name,
    'phone', p.phone,
    'role', p.role,
    'agency', p.agency_name,
    'logo', p.agency_logo_url,
    'accent', p.accent,
    'kind', p.account_kind,
    'licence_verified', p.licence_verified_at is not null,
    'listings', coalesce((
      select jsonb_agg(l.slug order by (l.status = 'sold'), l.published_at desc nulls last)
      from (
        select l.slug, l.status, l.published_at
        from public.listings l
        where l.owner_id = p.id
          and l.status in ('published', 'sold')
          and not (l.purchase_id is not null and l.expires_at is not null and l.expires_at <= now())
        order by (l.status = 'sold'), l.published_at desc nulls last
        limit 60
      ) l
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.page_enabled
    and p.account_kind in ('agent', 'office', 'dealer')
    and (
      (p_key ~ '^[0-9A-HJKMNP-TV-Z]{5}$' and p.page_code = p_key)
      or (p.page_handle is not null and p.page_handle = p_key)
    )
  limit 1;
$$;

-- Every page that is on, by its preferred address, for the sitemap.
create or replace function public.public_agent_keys()
returns table (key text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.page_handle, p.page_code)
  from public.profiles p
  where p.page_enabled
    and p.account_kind in ('agent', 'office', 'dealer')
    and p.page_code is not null;
$$;

revoke all on function public.agent_handle_problem(text, uuid) from public;
revoke all on function public.agent_handle_available(text) from public;
revoke all on function public.enable_agent_page() from public;
revoke all on function public.disable_agent_page() from public;
revoke all on function public.set_agent_handle(text) from public;
revoke all on function public.public_agent(text) from public;
revoke all on function public.public_agent_keys() from public;

grant execute on function public.agent_handle_available(text) to authenticated;
grant execute on function public.enable_agent_page() to authenticated;
grant execute on function public.disable_agent_page() to authenticated;
grant execute on function public.set_agent_handle(text) to authenticated;
grant execute on function public.public_agent(text) to anon, authenticated;
grant execute on function public.public_agent_keys() to anon, authenticated;
