-- Photo check on the owner's Mac (docs/PARKED-MEDIA.md, docs/LOCAL-AI.md).
--
-- review_photos is a job the editor enqueues and only the Mac claims.
-- The answers live in photo_reviews, not on listings: a listings column
-- would be readable with the published row.
--
-- ADD VALUE cannot be used by a later statement in the same transaction.
-- Nothing below names the new value.

alter type public.job_type add value if not exists 'review_photos';

create table if not exists public.photo_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  photo_path text not null,
  room text,
  room_confidence real,
  issues text[] not null default '{}',
  tip text,
  score int,
  created_at timestamptz not null default now(),
  unique (listing_id, photo_path)
);

comment on table public.photo_reviews is
  'Advice about one photograph. The owner may read it. The published listing does not.';

create index if not exists photo_reviews_by_listing on public.photo_reviews (listing_id);

alter table public.photo_reviews enable row level security;

create policy "photo_reviews_select_own"
  on public.photo_reviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = photo_reviews.listing_id
        and l.owner_id = (select auth.uid())
    )
  );

-- No insert, update or delete policy. The Mac writes through the function
-- below, which the service role alone may call.

create or replace function public.attach_photo_review(
  p_listing_id uuid,
  p_photo_path text,
  p_room text,
  p_room_confidence real,
  p_issues text[],
  p_tip text,
  p_score int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

  if p_tip is not null and p_tip not in (
    'openCurtain', 'stepBack', 'turnOnLight', 'straighten', 'retake', 'hidePlate', 'clearClutter'
  ) then
    raise exception 'bad_tip';
  end if;

  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'bad_score';
  end if;

  insert into public.photo_reviews (
    listing_id, photo_path, room, room_confidence, issues, tip, score
  )
  values (
    p_listing_id, p_photo_path, p_room, p_room_confidence, coalesce(p_issues, '{}'::text[]), p_tip, p_score
  )
  on conflict (listing_id, photo_path) do update
    set room = excluded.room,
        room_confidence = excluded.room_confidence,
        issues = excluded.issues,
        tip = excluded.tip,
        score = excluded.score,
        created_at = now();
end;
$$;

comment on function public.attach_photo_review(uuid, text, text, real, text[], text, int) is
  'Records one photograph''s advice. Service role only. Does not write listings.media.';

revoke all on function public.attach_photo_review(uuid, text, text, real, text[], text, int) from public, anon, authenticated;
grant execute on function public.attach_photo_review(uuid, text, text, real, text[], text, int) to service_role;
