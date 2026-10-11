-- The signed-in owner may record DeepSeek's advice about their own
-- photographs. The Worker calls this with the agent's token. The service
-- role function from 0037 stays as it is.
--
-- The owner check is the authorisation. The function is security definer
-- because photo_reviews has no insert policy.

create or replace function public.attach_own_photo_review(
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

comment on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int) is
  'The owner records one photograph''s advice. Does not write listings.media.';

revoke all on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int) from public, anon;
grant execute on function public.attach_own_photo_review(uuid, text, text, real, text[], text, int) to authenticated;
