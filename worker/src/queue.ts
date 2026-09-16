import { db } from './db.js';
import { env } from './env.js';
import { JobFailure, type Job, type JobType } from './types.js';

/**
 * Queue mechanics.
 *
 * The claim is an RPC because FOR UPDATE SKIP LOCKED cannot be expressed
 * through PostgREST — see supabase/migrations/0003_jobs.sql. Everything else
 * is a plain update, since the service role bypasses RLS.
 */

/** Exponential backoff, capped. 30s, 1m, 2m, 4m, 8m. */
function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 8 * 60);
}

export async function claim(jobTypes: JobType[]): Promise<Job | null> {
  const { data, error } = await db().rpc('claim_job', {
    p_job_types: jobTypes,
    p_locked_by: env.instanceId,
    p_stale_after: `${Math.round(env.staleClaimMs / 1000)} seconds`,
  });

  if (error) {
    throw new Error(`claim failed: ${error.message}`);
  }

  return claimedJob(data);
}

/**
 * What the claim RPC actually returned: a job, or nothing to do.
 *
 * AN EMPTY QUEUE ARRIVES AS A ROW OF NULLS, NOT AS null.
 *
 * `claim_job` is declared `returns public.jobs`, and PostgREST renders a
 * composite NULL as an object with every field set to null rather than as JSON
 * null. A `?? null` therefore kept it, the loop treated it as a claimed job,
 * no handler matched a null `job_type`, and the failure path issued
 *
 *   PATCH /rest/v1/jobs?id=eq.null  ->  400
 *
 * Because a job HAD been "claimed", the loop also skipped its idle sleep and
 * polled again immediately. On the live project that was thousands of 400s a
 * minute, indefinitely, from a machine with nothing to do — and it started the
 * moment the queue emptied, so the thing that triggered it was the pipeline
 * working correctly.
 *
 * Exported for its test rather than for a caller: the shape of a composite
 * NULL over PostgREST is not something to rediscover in production.
 */
export function claimedJob(data: unknown): Job | null {
  if (!data || typeof data !== 'object') return null;

  // The primary key. A row without one is not a row.
  const { id } = data as { id?: unknown };
  return typeof id === 'string' && id !== '' ? (data as Job) : null;
}

/** Reports progress to the row the app is subscribed to over Realtime. */
export async function reportProgress(jobId: string, percent: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  await db().from('jobs').update({ progress: clamped }).eq('id', jobId);
}

export async function complete(jobId: string, result: Record<string, unknown>): Promise<void> {
  await db()
    .from('jobs')
    .update({ status: 'done', progress: 100, result, error_code: null, locked_by: null })
    .eq('id', jobId);
}

/**
 * Records a failure.
 *
 * Retryable failures go back to 'queued' with backoff until max_attempts.
 * A permanent failure — an unreadable file, a missing input — goes straight to
 * 'failed', because retrying it five times only delays telling the seller.
 *
 * Either way the listing is untouched. A failed job never blocks publishing
 * (Stage D7): a tour with one bad room publishes with the rooms that worked.
 */
export async function fail(job: Job, failure: JobFailure | Error): Promise<void> {
  const code = failure instanceof JobFailure ? failure.code : 'internal_error';
  const retryable = failure instanceof JobFailure ? failure.retryable : true;
  const exhausted = job.attempts >= job.max_attempts;

  if (!retryable || exhausted) {
    await db()
      .from('jobs')
      .update({ status: 'failed', error_code: code, locked_by: null })
      .eq('id', job.id);
    return;
  }

  const seconds = backoffSeconds(job.attempts);
  await db()
    .from('jobs')
    .update({
      status: 'queued',
      error_code: code,
      locked_by: null,
      next_attempt_at: new Date(Date.now() + seconds * 1000).toISOString(),
    })
    .eq('id', job.id);
}
