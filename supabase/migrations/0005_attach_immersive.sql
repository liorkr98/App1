-- Attaching pipeline output to a listing.
--
-- Rooms stitch concurrently: one stitch_panorama job per scene, two or three
-- running at once on the worker machine. If each of them read listings.media,
-- spliced its scene in and wrote the whole object back, the last writer would
-- silently drop the scenes that finished while it was working — and only
-- sometimes, which is the hardest kind of data loss to notice.
--
-- So the merge happens here, under a row lock, in one statement.

-- ---------------------------------------------------------------------------
-- attach_pano_scene
-- ---------------------------------------------------------------------------
--
-- Idempotent by scene id: re-running a job replaces that scene rather than
-- appending a second copy. That matters because the queue retries.

create or replace function public.attach_pano_scene(
  p_listing_id uuid,
  p_scene jsonb
)
returns void
language plpgsql
as $$
declare
  v_media jsonb;
  v_scenes jsonb;
  v_links jsonb;
  v_bytes numeric;
begin
  if p_scene->>'id' is null then
    raise exception 'scene payload has no id';
  end if;

  -- FOR UPDATE is what serialises the concurrent room jobs.
  select media into v_media
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;

  v_media := coalesce(v_media, '{}'::jsonb);
  v_links := coalesce(v_media #> '{immersive,links}', '[]'::jsonb);

  select coalesce(jsonb_agg(scene), '[]'::jsonb)
  into v_scenes
  from jsonb_array_elements(coalesce(v_media #> '{immersive,scenes}', '[]'::jsonb)) as scene
  where scene->>'id' is distinct from p_scene->>'id';

  v_scenes := v_scenes || jsonb_build_array(p_scene);

  -- Recomputed from the scenes every time rather than accumulated, so a retry
  -- cannot double-count and the number stays honest.
  select coalesce(sum((scene->>'bytes')::numeric), 0)
  into v_bytes
  from jsonb_array_elements(v_scenes) as scene;

  update public.listings
  set media = jsonb_set(
    v_media,
    '{immersive}',
    jsonb_build_object(
      'type', 'tour',
      'scenes', v_scenes,
      'links', v_links,
      -- One decimal place: this is shown to a seller as "12.4 מ״ב" before they
      -- opt in on cellular, and more precision would be false precision.
      'payloadMb', round(v_bytes / 1048576.0, 1)
    ),
    true
  )
  where id = p_listing_id;
end;
$$;

comment on function public.attach_pano_scene(uuid, jsonb) is
  'Merges one stitched room into listings.media.immersive under a row lock.';

-- ---------------------------------------------------------------------------
-- attach_spin
-- ---------------------------------------------------------------------------
--
-- No merge needed: a vehicle has exactly one spin, produced by one job.

create or replace function public.attach_spin(
  p_listing_id uuid,
  p_spin jsonb
)
returns void
language plpgsql
as $$
begin
  update public.listings
  set media = jsonb_set(coalesce(media, '{}'::jsonb), '{immersive}', p_spin, true)
  where id = p_listing_id;

  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;
end;
$$;

comment on function public.attach_spin(uuid, jsonb) is
  'Replaces listings.media.immersive with a completed 360 spin.';

-- ---------------------------------------------------------------------------
-- attach_pdf
-- ---------------------------------------------------------------------------

create or replace function public.attach_pdf(
  p_listing_id uuid,
  p_url text
)
returns void
language plpgsql
as $$
begin
  update public.listings
  set media = jsonb_set(coalesce(media, '{}'::jsonb), '{pdfUrl}', to_jsonb(p_url), true)
  where id = p_listing_id;

  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;
end;
$$;

comment on function public.attach_pdf(uuid, text) is
  'Records the rendered PDF URL on the listing.';

-- ---------------------------------------------------------------------------
-- Who may call these
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so leaving these
-- alone would let any signed-in user rewrite their own listing's immersive
-- payload directly — pointing a "tour" at any URL they liked, on a page that
-- other people open from WhatsApp. Only the worker calls these.
--
-- They run as INVOKER, not SECURITY DEFINER: the worker's service role already
-- bypasses RLS, so a definer function would add privilege without adding
-- capability, and would keep working if the grant below were ever loosened.

revoke all on function public.attach_pano_scene(uuid, jsonb) from public;
revoke all on function public.attach_spin(uuid, jsonb) from public;
revoke all on function public.attach_pdf(uuid, text) from public;

grant execute on function public.attach_pano_scene(uuid, jsonb) to service_role;
grant execute on function public.attach_spin(uuid, jsonb) to service_role;
grant execute on function public.attach_pdf(uuid, text) to service_role;
