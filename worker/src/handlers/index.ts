import type { JobHandler, JobType } from '../types.js';

import { enhanceImages } from './enhance.js';
import { extractFrames } from './frames.js';
import { generateOg } from './og.js';
import { renderPdf } from './pdf.js';
import { buildSprite } from './sprite.js';
import { stitchPanorama } from './stitch.js';

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
  stitch_panorama: stitchPanorama,
  extract_frames: extractFrames,
  build_sprite: buildSprite,
  generate_og: generateOg,
};

/** Puppeteer only. Concurrency 1, memory capped, aggressive restart. */
export const PDF_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  render_pdf: renderPdf,
};

export function handlersFor(role: 'worker' | 'pdf'): Partial<Record<JobType, JobHandler>> {
  return role === 'pdf' ? PDF_HANDLERS : WORKER_HANDLERS;
}
