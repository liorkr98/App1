import type { Sharp } from 'sharp';

/**
 * The seam for v1.5 external enhancement.
 *
 * Perspective correction and window pull are what separate a phone snap from
 * an estate-agent photo, and they are hard. Autoenhance.ai and similar do them
 * well for roughly $0.30–0.58 per image (RESEARCH.md §7) — a real cost that
 * only makes sense once someone is paying us.
 *
 * So this is a no-op today, and deliberately the ONLY place that would change.
 * Swapping in an API means editing this one file: upload the buffer, poll,
 * download the result. Nothing in the handler, the queue or the schema moves.
 *
 * Keeping the seam costs one function call. Not keeping it would mean
 * unpicking enhancement from the middle of a pipeline later, which is exactly
 * the kind of change that gets deferred forever.
 */
export function enhanceAdvanced(image: Sharp): Promise<Sharp> {
  return Promise.resolve(image);
}
