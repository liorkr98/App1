-- claim_job returns jsonb, so "nothing to do" is JSON null.
--
-- ============================ THE LIVE INCIDENT ============================
-- On 16 September 2026 the project logged 14,160 requests in seven minutes —
-- about 34 a second, indefinitely — all of them
--
--   PATCH /rest/v1/jobs?id=eq.null   ->   400
--
-- from a worker whose queue was empty and whose every job was `done`.
--
-- WHY. This function was declared `returns public.jobs`. When it returned
-- NULL, PostgREST rendered the composite as an OBJECT WITH EVERY FIELD NULL
-- rather than as JSON null. The worker's `(data as Job | null) ?? null` kept
-- it, the poll loop treated it as a claimed job, no handler matched a null
-- `job_type`, and the failure path patched the row whose id is nothing. Having
-- "claimed" something, the loop also skipped its idle sleep and polled again
-- at once.
--
-- So the queue emptying is what started it: the pipeline working correctly was
-- the trigger.
--
-- WHY FIX IT HERE AS WELL AS IN THE WORKER. worker/src/queue.ts now checks for
-- an id and is the durable fix, but the worker is a container on Fly and this
-- is a running incident — the machine burning the requests is the one already
-- deployed. A scalar return type stops it for that machine too, with no
-- deploy: PostgREST renders a null scalar as JSON null, which the existing
-- `?? null` handles correctly and has always handled correctly.
--
-- `jsonb` rather than a composite because the composite-NULL rendering is the
-- trap itself, and nothing about this function needs a row type: every caller
-- reads it as JSON over REST. `to_jsonb` produces exactly the same field names
-- the worker already reads.
--
-- DROP and CREATE, not CREATE OR REPLACE: Postgres will not replace a function
-- with a different return type. The grants are re-applied below, because
-- dropping the function drops them with it — and that revoke is the whole
-- reason only the worker can claim.
-- =========================================================================

drop function if exists public.claim_job(public.job_type[], text, interval);

create function public.claim_job(
  p_job_types public.job_type[],
  p_locked_by text,
  p_stale_after interval
)
returns jsonb
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

  -- JSON null, not a row of nulls. This is the line the incident was about.
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

  return to_jsonb(v_job);
end;
$$;

-- Only the worker may claim. The service role bypasses RLS and is not subject
-- to these grants, so revoking from every client role leaves exactly one
-- caller. Re-applied because the drop above took the original grants with it.
revoke execute on function public.claim_job(public.job_type[], text, interval)
  from public, anon, authenticated;
