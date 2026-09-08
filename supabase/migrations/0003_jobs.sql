-- The job queue (ADR 0001).
--
-- Postgres rather than Redis or SQS, for three reasons that matter more than
-- throughput at this volume:
--
--   1. Job state and listing state commit in ONE transaction, so there is no
--      window where a job succeeded and the listing does not know it.
--   2. Idempotency is enforced by a unique index, not by application code.
--   3. Progress reporting is free — the app subscribes to its own job rows
--      through Supabase Realtime, so there is no WebSocket server of ours.

create type public.job_status as enum ('queued', 'processing', 'done', 'failed');

create type public.job_type as enum (
  'enhance_images',
  'stitch_panorama',
  'extract_frames',
  'build_sprite',
  'generate_og',
  'render_pdf'
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  job_type public.job_type not null,

  -- Hash of everything that determines the output. Two enqueues with the same
  -- inputs are the same job, which is what makes the pipeline safe to retry.
  input_hash text not null,

  -- Which PART of the listing this job covers. NULL means listing-wide.
  --
  -- This column is what makes partial failure expressible: one room can fail
  -- while the rest of the tour publishes. Without it, failure is all-or-nothing
  -- and a single bad panorama would block an otherwise finished listing.
  scope_key text,
  -- Hebrew label of that part, e.g. סלון. Surfaced in the failure message so
  -- the seller is told WHICH room to re-shoot.
  scope_label text,

  status public.job_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),

  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  next_attempt_at timestamptz not null default now(),

  -- Machine-readable only. A raw exception message can carry a signed URL or a
  -- file path into client logs and Sentry (CLAUDE.md §8); the app maps this
  -- code to Hebrew copy.
  error_code text,

  payload jsonb not null default '{}'::jsonb,
  result jsonb,

  -- Claim bookkeeping, so a worker that dies mid-job can be detected.
  locked_at timestamptz,
  locked_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is
  'Work queue. Claimed with FOR UPDATE SKIP LOCKED. Job failure never blocks publishing.';

-- Stage D''s idempotency key, enforced by the database rather than by the
-- worker. A retry updates this row; it cannot fork into a duplicate job.
create unique index jobs_idempotent
  on public.jobs (listing_id, job_type, input_hash);

-- Serves the claim query. Partial index: only queued rows are ever scanned.
create index jobs_claimable
  on public.jobs (next_attempt_at, created_at)
  where status = 'queued';

create index jobs_by_listing on public.jobs (listing_id, status);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

alter table public.jobs enable row level security;

-- --- Policies --------------------------------------------------------------

-- A user may READ job rows belonging to their own listings, and nothing else.
-- This is also what scopes the Realtime subscription that drives the progress
-- UI — the policy is the security boundary for both.
create policy "jobs_select_own"
  on public.jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = jobs.listing_id
        and l.owner_id = (select auth.uid())
    )
  );

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
--
-- Users must not write to this table at all. With an update policy a user
-- could mark a job 'done' and skip the processing they have not paid for, or
-- reset another listing's place in the queue. The worker connects with the
-- service role, which bypasses RLS entirely, and enqueueing goes through the
-- SECURITY DEFINER function below.

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------

-- security definer so it can insert into a table the caller cannot write, but
-- it verifies ownership first and derives listing_id from the argument rather
-- than trusting a caller-supplied owner.
--
-- search_path is pinned empty so a schema on the caller's path cannot hijack
-- the unqualified names inside.
create or replace function public.enqueue_job(
  p_listing_id uuid,
  p_job_type public.job_type,
  p_input_hash text,
  p_scope_key text default null,
  p_scope_label text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if not exists (
    select 1 from public.listings l
    where l.id = p_listing_id and l.owner_id = (select auth.uid())
  ) then
    raise exception 'not_your_listing' using errcode = '42501';
  end if;

  -- Idempotent by the unique index. Re-enqueueing the same work re-queues the
  -- existing row rather than creating a second one, which is also how retry
  -- after a failure works.
  insert into public.jobs (listing_id, job_type, input_hash, scope_key, scope_label, payload)
  values (p_listing_id, p_job_type, p_input_hash, p_scope_key, p_scope_label, p_payload)
  on conflict (listing_id, job_type, input_hash) do update
    set status = 'queued',
        attempts = 0,
        next_attempt_at = now(),
        error_code = null,
        progress = 0
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke execute on function public.enqueue_job(uuid, public.job_type, text, text, text, jsonb) from public, anon;
grant execute on function public.enqueue_job(uuid, public.job_type, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Processing summary
-- ---------------------------------------------------------------------------

-- What the app renders while a listing is being processed, and how it decides
-- which of Stage D7's two Hebrew messages to show.
--
-- security_invoker so the reader's own RLS applies: a user sees rows for their
-- listings only, exactly as they would querying jobs directly.
create or replace view public.listing_processing
with (security_invoker = true)
as
select
  j.listing_id,
  count(*)::int                                             as total,
  count(*) filter (where j.status = 'done')::int            as done,
  count(*) filter (where j.status = 'failed')::int          as failed,
  count(*) filter (where j.status in ('queued','processing'))::int as pending,
  -- Any listing-wide failure means "processing failed, your photos are safe".
  bool_or(j.status = 'failed' and j.scope_key is null)      as has_global_failure,
  -- A scoped failure means "one room did not process, re-shoot it" — and
  -- these are the room names to show.
  array_remove(
    array_agg(j.scope_label) filter (where j.status = 'failed' and j.scope_key is not null),
    null
  )                                                          as failed_scopes,
  -- Coarse progress across the whole listing, for a single bar.
  coalesce(avg(j.progress) filter (where j.status <> 'failed'), 0)::int as progress
from public.jobs j
group by j.listing_id;

comment on view public.listing_processing is
  'Per-listing job rollup. Publishing never reads this — a listing with failed jobs is still publishable.';

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------

-- FOR UPDATE SKIP LOCKED cannot be expressed through PostgREST, so the claim
-- is an RPC. Two workers polling at the same instant each get a different row
-- instead of fighting over one — that is the whole reason this is a function
-- and not a select-then-update from the worker.
--
-- Also reclaims abandoned work: a row stuck in 'processing' past p_stale_after
-- belongs to a machine that died mid-job, and Fly restarts machines routinely.
-- Without this, one crash strands a job forever.
create or replace function public.claim_job(
  p_job_types public.job_type[],
  p_locked_by text,
  p_stale_after interval
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job
  from public.jobs j
  where j.job_type = any (p_job_types)
    and j.attempts < j.max_attempts
    and (
      (j.status = 'queued' and j.next_attempt_at <= now())
      or (j.status = 'processing' and j.locked_at < now() - p_stale_after)
    )
  order by j.created_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing',
      locked_at = now(),
      locked_by = p_locked_by,
      -- Incremented at CLAIM, not at failure. A worker killed mid-job never
      -- reports anything, so counting at failure would let a job that
      -- reliably crashes the process retry forever.
      attempts = jobs.attempts + 1,
      progress = 0,
      error_code = null
  where jobs.id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

-- Only the worker may claim. The service role bypasses RLS and is not subject
-- to these grants, so revoking from every client role leaves exactly one
-- caller.
revoke execute on function public.claim_job(public.job_type[], text, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Note on the enqueue_job security advisor warning
-- ---------------------------------------------------------------------------
--
-- Supabase's linter flags enqueue_job as a SECURITY DEFINER function callable
-- by `authenticated`. That is INTENTIONAL and must not be "fixed" by revoking
-- the grant — it is the only path by which a user can queue work, and it
-- verifies ownership before it inserts.
--
-- Contrast with handle_new_user in 0001_init.sql, where the same warning WAS a
-- real problem: a trigger function has no business being reachable over REST.
--
-- What makes this one safe is ownership checking plus one thing that lives in
-- the worker rather than here: the payload carries storage paths supplied by
-- the client, and the worker reads them with the service role, which bypasses
-- RLS. worker/src/storage.ts:assertWithinListing rejects any path outside the
-- job's own listing folder. Without it, a user could enqueue against their own
-- listing while pointing at somebody else's originals.
