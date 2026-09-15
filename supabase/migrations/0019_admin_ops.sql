-- Admin operations: site-wide analytics, editor funnel, contact inbox.
--
-- ============================ HUMAN REVIEW ============================
-- CLAUDE.md §8. This migration does NOT grant listings. It reads
-- is_site_admin() to expose operator dashboards (users, events, messages).
-- Granting remains admin_grant_listings from 0016: a count, a note, fail
-- closed. Unknown / not-admin raises 42501. Contact insert is anon-callable
-- and stores PII (name, email, body) for the operator only — never logged
-- by the application, never selected except via admin RPCs.
-- ======================================================================

-- ---------------------------------------------------------------------------
-- Contact messages — the public form writes here; only admins read.
-- ---------------------------------------------------------------------------

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.contact_messages is
  'Inbound contact form. PII for the operator inbox. No client SELECT. Insert via submit_contact_message.';

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

create policy "contact_messages_select_admin"
  on public.contact_messages
  for select
  to authenticated
  using (public.is_site_admin());

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_body text,
  p_honeypot text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nid uuid;
  trimmed_name text;
  trimmed_email text;
  trimmed_body text;
  recent int;
begin
  -- Bots fill the hidden field. Succeed without writing so they learn nothing.
  if coalesce(trim(p_honeypot), '') <> '' then
    return gen_random_uuid();
  end if;

  trimmed_name := trim(coalesce(p_name, ''));
  trimmed_email := lower(trim(coalesce(p_email, '')));
  trimmed_body := trim(coalesce(p_body, ''));

  if char_length(trimmed_name) < 2 or char_length(trimmed_name) > 80 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  if trimmed_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(trimmed_email) > 120 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  if char_length(trimmed_body) < 10 or char_length(trimmed_body) > 2000 then
    raise exception 'invalid body' using errcode = '22023';
  end if;

  select count(*)::int into recent
  from public.contact_messages m
  where m.email = trimmed_email
    and m.created_at > now() - interval '10 minutes';

  if recent >= 3 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;

  insert into public.contact_messages (name, email, body)
  values (trimmed_name, trimmed_email, trimmed_body)
  returning id into nid;

  return nid;
end;
$$;

comment on function public.submit_contact_message(text, text, text, text) is
  'Anon-callable contact form. Validates, rate-limits by email, drops honeypot. Never logs the body.';

revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

create or replace function public.admin_mark_contact_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  update public.contact_messages
  set read_at = coalesce(read_at, now())
  where id = p_id;
end;
$$;

revoke all on function public.admin_mark_contact_read(uuid) from public, anon;
grant execute on function public.admin_mark_contact_read(uuid) to authenticated;

create or replace function public.admin_contact_messages()
returns table (
  id uuid,
  name text,
  email text,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  return query
    select m.id, m.name, m.email, m.body, m.created_at, m.read_at
    from public.contact_messages m
    order by (m.read_at is null) desc, m.created_at desc
    limit 200;
end;
$$;

revoke all on function public.admin_contact_messages() from public, anon;
grant execute on function public.admin_contact_messages() to authenticated;

-- ---------------------------------------------------------------------------
-- Editor funnel — where sellers stall. No PII. Step names only.
-- ---------------------------------------------------------------------------

create table if not exists public.editor_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  step text not null,
  kind text not null check (kind in ('enter', 'blocked', 'publish_ok', 'publish_fail')),
  created_at timestamptz not null default now(),
  constraint editor_events_step_check check (
    step in (
      'category', 'details', 'photos', 'rooms', 'plate', 'consent',
      'facts', 'disclosures', 'description', 'template', 'preview', 'publish'
    )
  )
);

comment on table public.editor_events is
  'Editor funnel. Step + kind only. No copy, no email, no IP. Insert via record_editor_event.';

create index if not exists editor_events_step_kind_idx
  on public.editor_events (step, kind, created_at desc);

alter table public.editor_events enable row level security;

create policy "editor_events_select_admin"
  on public.editor_events
  for select
  to authenticated
  using (public.is_site_admin());

create or replace function public.record_editor_event(
  p_step text,
  p_kind text,
  p_listing_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := (select auth.uid());
  if uid is null then
    return;
  end if;

  if p_kind not in ('enter', 'blocked', 'publish_ok', 'publish_fail') then
    return;
  end if;

  if p_step not in (
    'category', 'details', 'photos', 'rooms', 'plate', 'consent',
    'facts', 'disclosures', 'description', 'template', 'preview', 'publish'
  ) then
    return;
  end if;

  if p_listing_id is not null then
    if not exists (
      select 1 from public.listings l
      where l.id = p_listing_id and l.owner_id = uid
    ) then
      return;
    end if;
  end if;

  insert into public.editor_events (user_id, listing_id, step, kind)
  values (uid, p_listing_id, p_step, p_kind);
end;
$$;

comment on function public.record_editor_event(text, text, uuid) is
  'Authenticated editor funnel ping. Silent no-op when signed out or the listing is not theirs.';

revoke all on function public.record_editor_event(text, text, uuid) from public, anon;
grant execute on function public.record_editor_event(text, text, uuid) to authenticated;

create or replace function public.admin_editor_funnel()
returns table (
  step text,
  entered bigint,
  blocked bigint,
  publish_ok bigint,
  publish_fail bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  return query
    select
      s.step::text,
      count(*) filter (where e.kind = 'enter')::bigint,
      count(*) filter (where e.kind = 'blocked')::bigint,
      count(*) filter (where e.kind = 'publish_ok')::bigint,
      count(*) filter (where e.kind = 'publish_fail')::bigint
    from (
      values
        ('category'), ('details'), ('photos'), ('rooms'), ('plate'), ('consent'),
        ('facts'), ('disclosures'), ('description'), ('template'), ('preview'), ('publish')
    ) as s(step)
    left join public.editor_events e
      on e.step = s.step
     and e.created_at > now() - interval '30 days'
    group by s.step
    order by min(array_position(
      array[
        'category','details','photos','rooms','plate','consent',
        'facts','disclosures','description','template','preview','publish'
      ],
      s.step::text
    ));
end;
$$;

revoke all on function public.admin_editor_funnel() from public, anon;
grant execute on function public.admin_editor_funnel() to authenticated;

-- ---------------------------------------------------------------------------
-- Site overview + every user (no search required).
-- ---------------------------------------------------------------------------

create or replace function public.admin_site_overview()
returns table (
  users bigint,
  listings bigint,
  drafts bigint,
  published bigint,
  views_7d bigint,
  wa_7d bigint,
  unread_messages bigint,
  grants_remaining bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  return query
    select
      (select count(*) from public.profiles)::bigint,
      (select count(*) from public.listings)::bigint,
      (select count(*) from public.listings l where l.status = 'draft')::bigint,
      (select count(*) from public.listings l where l.status = 'published')::bigint,
      (
        select count(*) from public.listing_events e
        where e.kind = 'view' and e.created_at > now() - interval '7 days'
      )::bigint,
      (
        select count(*) from public.listing_events e
        where e.kind = 'wa' and e.created_at > now() - interval '7 days'
      )::bigint,
      (
        select count(*) from public.contact_messages m where m.read_at is null
      )::bigint,
      (
        select coalesce(sum(g.remaining), 0)
        from public.listing_grants g
        where g.effective_from <= now()
          and (g.effective_to is null or g.effective_to > now())
      )::bigint;
end;
$$;

comment on function public.admin_site_overview() is
  'Admin-only site totals. Raises unless is_site_admin(). Does not grant.';

revoke all on function public.admin_site_overview() from public, anon;
grant execute on function public.admin_site_overview() to authenticated;

create or replace function public.admin_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  agency_name text,
  listings bigint,
  published bigint,
  remaining integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      u.email::text,
      p.display_name,
      p.agency_name,
      (select count(*) from public.listings l where l.owner_id = p.id)::bigint,
      (
        select count(*) from public.listings l
        where l.owner_id = p.id and l.status = 'published'
      )::bigint,
      coalesce((
        select sum(g.remaining)::int
        from public.listing_grants g
        where g.user_id = p.id
          and g.effective_from <= now()
          and (g.effective_to is null or g.effective_to > now())
      ), 0),
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 500;
end;
$$;

comment on function public.admin_users() is
  'Admin-only directory of every profile. Emails from auth.users. Does not grant.';

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
