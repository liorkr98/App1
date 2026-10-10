-- Upload from your phone (10 Oct 2026).
--
-- The agent builds a listing on a computer and the photographs are on their
-- phone. The editor shows a QR code; the phone opens /up/#<token> with no
-- sign-in, and every photograph it sends lands in this listing's inbox. The
-- editor, which stays open on the computer, collects them into its own photo
-- list and saves them the ordinary way — the editor remains the only writer
-- of listings.media. Two writers is how photographs were lost before
-- (web/src/lib/listing-row.ts, "NO COVER MEANS DO NOT WRITE").
--
-- THE TOKEN IS THE CAPABILITY, so it is treated like a password:
--
--   * 128+ bits from gen_random_uuid() twice; only its SHA-256 is stored.
--   * One listing, 30 minutes, closed when the agent closes the panel or
--     opens a new one.
--   * Nothing here can be inserted or edited directly by a client: a portal
--     is made and closed by the two functions below, which check ownership.
--   * The phone's uploads are written by /api/phone-upload with the service
--     role, AFTER that route has matched the token's hash to an open portal.
--
-- EXIF (CLAUDE.md §9): the phone strips each photograph by redrawing it on a
-- canvas (web/src/lib/listing-photo.ts), and the route refuses any WebP that
-- still carries an EXIF or XMP chunk (web/src/lib/phone-portal.ts).

create table if not exists public.photo_portals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists photo_portals_listing_idx on public.photo_portals (listing_id);

alter table public.photo_portals enable row level security;

-- The owner may see their own portals (the editor reads the expiry back).
-- No insert, update or delete policy: the functions below are the only way.
create policy "photo_portals_select_own"
  on public.photo_portals
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create table if not exists public.photo_inbox (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references public.photo_portals (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null,
  path text not null,
  width integer not null check (width > 0 and width <= 4000),
  height integer not null check (height > 0 and height <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists photo_inbox_listing_idx on public.photo_inbox (listing_id, created_at);

alter table public.photo_inbox enable row level security;

-- The owner reads what arrived, and deletes a row once the editor has taken
-- the photograph into its own list. Inserts come from the service role only.
create policy "photo_inbox_select_own"
  on public.photo_inbox
  for select
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = photo_inbox.listing_id
        and l.owner_id = (select auth.uid())
    )
  );

create policy "photo_inbox_delete_own"
  on public.photo_inbox
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = photo_inbox.listing_id
        and l.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- create_photo_portal: a fresh 30-minute token for one listing the caller owns
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because there is no insert policy, on purpose: a client
-- that could insert its own row could also choose its own expiry. The
-- ownership check is the first statement, and the search_path is pinned.
create or replace function public.create_photo_portal(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_token text;
  v_portal public.photo_portals;
begin
  if v_owner is null or not exists (
    select 1 from public.listings l where l.id = p_listing_id and l.owner_id = v_owner
  ) then
    raise exception 'not_owner';
  end if;

  -- One open portal per listing: a new QR retires the old one.
  update public.photo_portals
  set closed_at = now()
  where listing_id = p_listing_id and closed_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.photo_portals (listing_id, owner_id, token_hash, expires_at)
  values (
    p_listing_id,
    v_owner,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + interval '30 minutes'
  )
  returning * into v_portal;

  return jsonb_build_object('id', v_portal.id, 'token', v_token, 'expiresAt', v_portal.expires_at);
end;
$$;

revoke all on function public.create_photo_portal(uuid) from public, anon;
grant execute on function public.create_photo_portal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- close_photo_portal: the agent closed the panel; the QR stops working now
-- ---------------------------------------------------------------------------
create or replace function public.close_photo_portal(p_portal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.photo_portals
  set closed_at = coalesce(closed_at, now())
  where id = p_portal_id and owner_id = auth.uid();
end;
$$;

revoke all on function public.close_photo_portal(uuid) from public, anon;
grant execute on function public.close_photo_portal(uuid) to authenticated;
