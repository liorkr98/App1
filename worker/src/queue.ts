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

  return (data as Job | null) ?? null;
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
