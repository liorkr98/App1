import { supabase } from './supabase';

/** SHA-256 hex of the public URLs, in the order the agent arranged them. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Queues a review_photos job. The editor does not call this: it asks
 * /api/photo-review, and DeepSeek looks at the photograph there.
 *
 * `enqueue_job` resets a matching row to queued. A job that already exists
 * for this hash is left alone, so opening the editor does not start the
 * check again. A missing table is the caller's to ignore: advice never
 * blocks a step.
 */
export async function enqueuePhotoReview(listingId: string, urls: readonly string[]): Promise<void> {
  if (urls.length === 0 || typeof crypto === 'undefined' || !crypto.subtle) return;
  const hash = await sha256Hex(urls.join('\n'));
  const client = supabase();
  const existing = await client
    .from('jobs')
    .select('id')
    .eq('listing_id', listingId)
    .eq('job_type', 'review_photos')
    .eq('input_hash', hash)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (Array.isArray(existing.data) && existing.data.length > 0) return;
  const queued = await client.rpc('enqueue_job', {
    p_listing_id: listingId,
    p_job_type: 'review_photos',
    p_input_hash: hash,
  });
  if (queued.error) throw new Error(queued.error.message);
}
