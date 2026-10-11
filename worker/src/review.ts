import { pathToFileURL } from 'node:url';

import { env } from './env.js';
import { reviewPhotos } from './handlers/review-photos.js';
import { claim, complete, fail, reportProgress } from './queue.js';
import { JobFailure } from './types.js';

/**
 * Drain review_photos, then exit.
 *
 * This is the command the owner's Mac runs (`npm run review`). It is not the
 * Fly loop: that app was deleted, and this process must stop when the queue
 * is empty so a launchd job can start it again later.
 */

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, instance: env.instanceId, ...fields }));
}

async function main(): Promise<void> {
  log('review_started');
  let done = 0;
  for (;;) {
    const job = await claim(['review_photos']);
    if (!job) break;
    const startedAt = Date.now();
    try {
      const result = await reviewPhotos({
        job,
        progress: (percent) => reportProgress(job.id, percent),
      });
      await complete(job.id, result);
      done += 1;
      log('review_done', { jobId: job.id, ms: Date.now() - startedAt, ...result });
    } catch (error) {
      const failure = error instanceof JobFailure ? error : new JobFailure('internal_error', true);
      await fail(job, failure);
      log('review_failed', { jobId: job.id, code: failure.code, ms: Date.now() - startedAt });
    }
  }
  log('review_idle', { done });
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    log('fatal', { message: error instanceof Error ? error.message : 'unknown' });
    process.exit(1);
  });
}
