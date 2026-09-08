/**
 * Worker configuration.
 *
 * The service-role key lives in Fly secrets and reaches the process as an
 * environment variable. It is never in the repo, never in an EXPO_PUBLIC_
 * variable, and never sent to a client (CLAUDE.md §8). It bypasses RLS
 * entirely, which is the whole reason users have no write policy on `jobs`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it with: fly secrets set ${name}=... (never commit it)`,
    );
  }
  return value;
}

/** Which Fly process group this instance is. See fly.toml and ADR 0001. */
export type WorkerRole = 'worker' | 'pdf';

function role(): WorkerRole {
  // Fly sets FLY_PROCESS_GROUP to the [processes] key that started the
  // machine, so the two groups need no separate command or per-group env —
  // one image, one entry point, and the group decides what it claims.
  // WORKER_ROLE overrides it locally, where there is no Fly.
  const value = process.env.WORKER_ROLE ?? process.env.FLY_PROCESS_GROUP ?? 'worker';
  if (value !== 'worker' && value !== 'pdf') {
    throw new Error(
      `Process group must be "worker" or "pdf", got "${value}". Check [processes] in fly.toml.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return required('SUPABASE_URL');
  },
  get serviceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },

  /**
   * Where the published listing pages live, e.g. https://listings.example.com.
   *
   * The PDF renderer drives a real browser against the real page, so there is
   * one template and two formats. Only the pdf process group ever reads this,
   * which is why it is a getter: the worker group must not fail to boot over a
   * variable it never uses.
   */
  get pageBaseUrl(): string {
    return required('PAGE_BASE_URL').replace(/\/+$/, '');
  },

  role: role(),

  /** Identifies which machine claimed a job, for stuck-job diagnosis. */
  instanceId: process.env.FLY_MACHINE_ID ?? `local-${process.pid}`,

  /** How long to sleep when the queue is empty, before polling again. */
  idlePollMs: Number(process.env.IDLE_POLL_MS ?? 5_000),

  /** A claim older than this is treated as abandoned and retried. */
  staleClaimMs: Number(process.env.STALE_CLAIM_MS ?? 10 * 60_000),
} as const;
