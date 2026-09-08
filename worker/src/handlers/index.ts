import type { JobHandler, JobType } from '../types.js';

import { enhanceImages } from './enhance.js';
import { generateOg } from './og.js';

/**
 * Handler registry, split by Fly process group (ADR 0001).
 *
 * Chrome is memory-hungry and it crashes. If PDF rendering shared a process
 * with stitching, a Chrome OOM would take a panorama job down with it — so the
 * two groups claim disjoint job types and cannot interfere.
 */

/** Image and video work. Concurrency 2-3. */
export const WORKER_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  enhance_images: enhanceImages,
  generate_og: generateOg,
  // stitch_panorama, extract_frames and build_sprite arrive in D-b.
};

/** Puppeteer only. Concurrency 1, memory capped, aggressive restart. */
export const PDF_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  // render_pdf arrives in D-b.
};

export function handlersFor(role: 'worker' | 'pdf'): Partial<Record<JobType, JobHandler>> {
  return role === 'pdf' ? PDF_HANDLERS : WORKER_HANDLERS;
}
