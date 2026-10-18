-- 0046: more from the photo check, and the agent's WhatsApp line (18 Oct 2026).
--
-- 1. photo_reviews.angle: where the camera stood round a car (front,
--    frontLeft, ... frontRight, or a close-up). The editor builds the 360
--    from the gallery with it, so the seller shoots one set of photographs,
--    not two.
-- 2. photo_reviews.seen: what a photograph shows that the seller may want to
--    state (a safe room, parking, the body colour). A suggestion the seller
--    confirms; never a fact on the page by itself (CLAUDE.md section 7).
-- 3. attach_own_photo_review takes both. Replaced, not overloaded: two
--    functions with one name and defaults are ambiguous to PostgREST.
-- 4. listings.share_line: one line the agent sends with the link, after the
--    title. Public, like the title: it is in the message everyone receives.
--
-- photo_reviews already has RLS (0037): the owner reads, nobody writes but
-- the functions. listings keeps its policies; share_line is one more column
-- the owner writes through them.
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them.

alter table public.photo_reviews
  add column if not exists angle text,
  add column if not exists seen text[] not null default '{}';

comment on column public.photo_reviews.angle is
  'Car photographs only: front, frontLeft, left, rearLeft, rear, rearRight, right, frontRight, interior, dashboard, engine, trunk, wheel, detail (0046).';
comment on column public.photo_reviews.seen is
  'Suggestions for the seller to confirm: shelter, parking, storage, elevator, balcony, renovated, needsRenovation, or a car body colour (0046).';

drop function if exists public.attach_own_photo_review(uuid, text, text, real, text[], text, int);

create or replace function public.attach_own_photo_review(
  p_listing_id uuid,
  p_photo_path text,
  p_room text,
  p_room_confidence real,
  p_issues text[],
  p_tip text,
  p_score int,
  p_angle text default null,
  p_seen text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.listings
    where id = p_listing_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  if p_photo_path is null
     or p_photo_path !~ ('^' || p_listing_id::text || '/browser/[^/]+$')
     or position('..' in p_photo_path) > 0
  then
    raise exception 'photo_path_outside_listing';
  end if;

  if p_room is not null and p_room not in (
    'living', 'kitchen', 'bedroom', 'bathroom', 'balcony', 'outdoor'
  ) then
    raise exception 'bad_room';
  end if;

  if p_angle is not null and p_angle not in (
    'front', 'frontLeft', 'left', 'rearLeft', 'rear', 'rearRight', 'right', 'frontRight',
    'interior', 'dashboard', 'engine', 'trunk', 'wheel', 'detail'
  ) then
    raise exception 'bad_angle';
  end if;

  if p_room_confidence is not null and (p_room_confidence < 0 or p_room_confidence > 1) then
    raise exception 'bad_confidence';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_issues, '{}'::text[])) as issue
    where issue not in (
      'dark', 'blurry', 'tilted', 'sideways', 'portraitCover', 'clutter',
      'person', 'documents', 'plate', 'blownWindow', 'tooClose'
    )
  ) then
    raise exception 'bad_issue';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_seen, '{}'::text[])) as item
    where item not in (
      'shelter', 'parking', 'storage', 'elevator', 'balcony', 'renovated', 'needsRenovation',
      'white', 'black', 'silver', 'grey', 'blue', 'red', 'green', 'brown', 'beige', 'yellow', 'orange'
    )
  ) then
    raise exception 'bad_seen';
  end if;

  if p_tip is not null and p_tip not in (
    'openCurtain', 'stepBack', 'turnOnLight', 'straighten', 'retake', 'hidePlate', 'clearClutter'
  ) then
    raise exception 'bad_tip';
  end if;

  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'bad_score';
  end if;

  insert into public.photo_reviews (
    listing_id, photo_path, room, room_confidence, issues, tip, score, angle, seen
  )
  values (
    p_listing_id, p_photo_path, p_room, p_room_confidence, coalesce(p_issues, '{}'::text[]), p_tip, p_score,
    p_angle, coalesce(p_seen, '{}'::text[])
  )
  on conflict (listing_id, photo_path) do update
    set room = excluded.room,
        room_confidence = excluded.room_confidence,
        issues = excluded.issues,
        tip = excluded.tip,
        score = excluded.score,
        angle = excluded.angle,
        seen = excluded.seen,
        created_at = now();
end;
$$;

comment on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int, text, text[]) is
  'The owner records one photograph of their own listing: advice, room or angle, and what it shows (0046). Does not write listings.media.';

revoke all on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int, text, text[]) from public, anon;
grant execute on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int, text, text[]) to authenticated;

-- The agent's own line for the WhatsApp message. One line, short: it sits
-- between the title and the facts, and a paragraph there pushes the link
-- preview off the first screen of the chat.
alter table public.listings
  add column if not exists share_line text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_share_line_shape') then
    alter table public.listings
      add constraint listings_share_line_shape check (
        share_line is null
        or (char_length(share_line) between 1 and 160 and position(chr(10) in share_line) = 0)
      );
  end if;
end;
$$;

comment on column public.listings.share_line is
  'One line the agent sends after the title in the WhatsApp message (0046). Public: it is in every message sent.';
