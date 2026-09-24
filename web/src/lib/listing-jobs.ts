import { supabase } from './supabase';

/**
 * Enqueues the jobs a newly published listing needs.
 *
 * Failure here must NEVER fail publish. The queue is best-effort: a listing
 * with unenhanced photos and a cover-photo OG card is still a listing, and
 * docs/PIPELINE.md says a failed job does not gate the link.
 *
 * `enhance_images` and `generate_og` only. PDF waits — the route is still a
 * stub until the worker is actually running against a stable origin.
 */
export async function enqueuePublishJobs(input: {
  listingId: string;
  originalPaths: readonly string[];
  coverPath?: string;
  price: number;
  priceDisplay?: 'exact' | 'from' | 'on_request';
}): Promise<void> {
  const hash = await sha256(
    [
      input.listingId,
      ...input.originalPaths,
      input.coverPath ?? '',
      String(input.price),
      input.priceDisplay ?? '',
    ].join('\0'),
  );

  if (input.originalPaths.length > 0) {
    await enqueue(input.listingId, 'enhance_images', hash, {
      sources: input.originalPaths,
    });
  }

  if (input.coverPath) {
    await enqueue(input.listingId, 'generate_og', `${hash}:og`, {
      cover: input.coverPath,
      price: input.price,
      ...(input.priceDisplay ? { priceDisplay: input.priceDisplay } : {}),
    });
  }
}

async function enqueue(
  listingId: string,
  jobType: 'enhance_images' | 'generate_og',
  inputHash: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase().rpc('enqueue_job', {
    p_listing_id: listingId,
    p_job_type: jobType,
    p_input_hash: inputHash,
    p_payload: payload,
  });

  if (error) {
    // Visible in the browser console for the agent who can act on it, with
    // no plate, phone or address in the message.
    console.warn('enqueue_job failed', jobType);
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
