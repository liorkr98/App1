import { pathToFileURL } from 'node:url';

import { env } from './env.js';
import { handlersFor } from './handlers/index.js';
import { claim, complete, fail, reportProgress } from './queue.js';
import { JobFailure, type JobType } from './types.js';

/**
 * Worker entry point.
 *
 * One loop: claim a job, run it, record the outcome, repeat. Sleeps when the
 * queue is empty so a scale-to-zero machine actually goes idle and Fly can
 * stop it (ADR 0001).
 *
 * WORKER_ROLE selects which job types this instance claims, which is what
 * keeps a Chrome crash in the pdf group away from an image job in the
 * worker group.
 */

let running = true;

function log(event: string, fields: Record<string, unknown> = {}): void {
  // Structured, one line, no PII. Never log a signed URL or a file path that
  // identifies a person's home (CLAUDE.md §8).
  console.log(JSON.stringify({ event, role: env.role, instance: env.instanceId, ...fields }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOnce(jobTypes: JobType[]): Promise<boolean> {
  const job = await claim(jobTypes);
  if (!job) return false;

  const handlers = handlersFor(env.role);
  const handler = handlers[job.job_type];

  log('job_claimed', { jobId: job.id, type: job.job_type, attempt: job.attempts });

  if (!handler) {
    // Claimed a type this role cannot run. Permanent by definition — retrying
    // lands on the same missing handler.
    await fail(job, new JobFailure('no_handler', false));
    log('job_failed', { jobId: job.id, code: 'no_handler' });
    return true;
  }

  const startedAt = Date.now();

  try {
    const result = await handler({
      job,
      progress: (percent) => reportProgress(job.id, percent),
    });
    await complete(job.id, result ?? {});
    log('job_done', { jobId: job.id, type: job.job_type, ms: Date.now() - startedAt });
  } catch (error) {
    const failure = error instanceof JobFailure ? error : new JobFailure('internal_error', true);
    await fail(job, failure);
    log('job_failed', {
      jobId: job.id,
      type: job.job_type,
      code: failure.code,
      retryable: failure.retryable,
      ms: Date.now() - startedAt,
    });
  }

  return true;
}

async function main(): Promise<void> {
  const jobTypes = Object.keys(handlersFor(env.role)) as JobType[];

  if (jobTypes.length === 0) {
    // Both groups have handlers today, so this is unreachable. Kept because
    // the alternative when it is not is a process that exits on boot, which
    // Fly restarts in a crash loop until someone reads the logs.
    log('no_handlers_idle');
    while (running) await sleep(env.idlePollMs);
    return;
  }

  if (env.role === 'pdf') {
    // Read it once at boot so a missing PAGE_BASE_URL is a startup failure
    // with the fix in the message. Left to the handler it would surface as a
    // job that fails, backs off, and fails again — five times, minutes apart,
    // with the real cause buried in an internal_error.
    log('page_base_url', { origin: new URL(env.pageBaseUrl).origin });
  }

  log('started', { jobTypes });

  while (running) {
    try {
      const didWork = await runOnce(jobTypes);
      if (!didWork) await sleep(env.idlePollMs);
    } catch (error) {
      // A claim failure means the database is unreachable. Back off rather
      // than spin — the machine is billed for the CPU it burns.
      log('claim_error', { message: error instanceof Error ? error.message : 'unknown' });
      await sleep(env.idlePollMs);
    }
  }

  log('stopped');
}

/**
 * Only start the loop when this file IS the process, not when something
 * merely loads it.
 *
 * Without the guard, importing this module starts an infinite queue poll as a
 * side effect. That is not hypothetical: `node --test` handed a directory
 * treats every file under it as a test, executed the compiled index.js, and
 * hung CI until the run was cancelled by hand. A module that cannot be loaded
 * without taking over the process is a trap for whatever loads it next.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntryPoint()) {
  // Fly sends SIGTERM before stopping a machine. Finish the current job rather
  // than abandoning it: an abandoned job sits in 'processing' until the stale
  // claim reclaims it, which delays the seller by minutes for no reason.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      log('shutdown_requested', { signal });
      running = false;
    });
  }

  main().catch((error: unknown) => {
    log('fatal', { message: error instanceof Error ? error.message : 'unknown' });
    process.exit(1);
  });
}
