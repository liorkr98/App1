import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { claimedJob } from './queue.js';

/**
 * The incident this file exists for.
 *
 * On 16 September 2026 the live project logged thousands of
 * `PATCH /rest/v1/jobs?id=eq.null -> 400` per minute from a worker with an
 * empty queue. Every job in the table was `done`; the storm was the poll loop
 * treating "nothing to do" as a claimed job.
 */
describe('claimedJob', () => {
  it('treats a composite NULL as nothing to do', () => {
    // What PostgREST returns for a `returns public.jobs` function that
    // returned NULL: the row, with every column null.
    assert.equal(
      claimedJob({
        id: null,
        listing_id: null,
        job_type: null,
        status: null,
        attempts: null,
        max_attempts: null,
        payload: null,
      }),
      null,
    );
  });

  it('treats JSON null and an absent body as nothing to do', () => {
    assert.equal(claimedJob(null), null);
    assert.equal(claimedJob(undefined), null);
  });

  it('returns a job that has an id', () => {
    const job = { id: 'b161e89d', job_type: 'enhance_images', attempts: 1 };
    assert.equal(claimedJob(job), job);
  });

  it('refuses an empty id rather than patching where id is nothing', () => {
    assert.equal(claimedJob({ id: '', job_type: 'enhance_images' }), null);
  });
});
