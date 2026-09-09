import { db } from './db.js';
import { JobFailure } from './types.js';

/**
 * Writes back into listings.media.
 *
 * An RPC rather than a read-modify-write from here, so that concurrent jobs
 * on the same listing cannot lose each other's writes. Only the PDF path
 * remains; the panorama and spin merges went with the deferred immersive work
 * (RESEARCH.md §9), and 0006 drops them from the database.
 */

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await db().rpc(name, args);

  if (error) {
    // Retryable: the write is idempotent — attaching the same URL twice is
    // the same write — so a retry after a dropped connection is safe.
    throw new JobFailure(`${name}_failed`, true);
  }
}

export function attachPdf(listingId: string, url: string): Promise<void> {
  return call('attach_pdf', { p_listing_id: listingId, p_url: url });
}
