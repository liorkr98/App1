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
  /**
   * P7: with a slug, the story image and the QR flyer are rendered too. They
   * render the published page, so they are asked for only after a publish.
   * `content` is what they show (title, template…) so an edit re-renders.
   */
  slug?: string;
  content?: string;
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

  // The depth map of the cover (P7). The worker reads the cover from the
  // row, not from here, and only from our own storage.
  if (input.coverPath) {
    await enqueue(input.listingId, 'depth_map', `${hash}:depth`, {});
  }

  if (input.slug) {
    const shown = `${hash}:${await sha256(input.content ?? '')}`;
    await enqueue(input.listingId, 'render_story', `${shown}:story`, { slug: input.slug });
    await enqueue(input.listingId, 'render_pdf', `${shown}:flyer`, { slug: input.slug, page: 'flyer' }, 'flyer');
  }
}

async function enqueue(
  listingId: string,
  jobType: 'enhance_images' | 'generate_og' | 'render_story' | 'render_pdf' | 'depth_map',
  inputHash: string,
  payload: Record<string, unknown>,
  scopeKey?: string,
): Promise<void> {
  const { error } = await supabase().rpc('enqueue_job', {
    p_listing_id: listingId,
    p_job_type: jobType,
    p_input_hash: inputHash,
    p_payload: payload,
    ...(scopeKey ? { p_scope_key: scopeKey } : {}),
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
