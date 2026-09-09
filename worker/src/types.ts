/**
 * Job shapes shared across the worker.
 *
 * Mirrors supabase/migrations/0003_jobs.sql. Kept as a hand-written type
 * rather than the generated Database type because the worker is the only
 * consumer and the generated file is regenerated on every migration — a churn
 * this process does not need.
 */

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

/**
 * stitch_panorama, extract_frames and build_sprite were here and are gone:
 * immersive capture is deferred (RESEARCH.md §9). The database CHECK
 * constraint in 0003_jobs.sql still permits them — deliberately left wide, so
 * that restoring the handlers is a code change and not a migration.
 */
export type JobType = 'enhance_images' | 'generate_og' | 'render_pdf';

export interface Job {
  id: string;
  listing_id: string;
  job_type: JobType;
  input_hash: string;
  /** null for listing-wide work; a scene id for per-room work. */
  scope_key: string | null;
  scope_label: string | null;
  status: JobStatus;
  progress: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
}

/**
 * What a handler reports back.
 *
 * `retryable` distinguishes a transient failure — a timeout, a 503 from
 * storage — from a permanent one like an unreadable file. Retrying a
 * permanent failure five times just delays telling the seller something is
 * wrong.
 */
export class JobFailure extends Error {
  constructor(
    /** Machine-readable. NEVER an exception message: those carry signed URLs. */
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'JobFailure';
  }
}

export interface JobContext {
  job: Job;
  /** Reports 0-100 back to the row the app is subscribed to. */
  progress: (percent: number) => Promise<void>;
}

export type JobHandler = (context: JobContext) => Promise<Record<string, unknown> | void>;
