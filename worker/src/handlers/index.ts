import type { JobHandler, JobType } from '../types.js';

import { renderCard } from './card.js';
import { depthMap } from './depth.js';
import { enhanceImages } from './enhance.js';
import { generateOg } from './og.js';
import { renderPdf } from './pdf.js';
import { renderStory } from './story.js';

/**
 * Handler registry, split by Fly process group (ADR 0001).
 *
 * Chrome is memory-hungry and it crashes. If PDF rendering shared a process
 * with image work, a Chrome OOM would take an enhancement job down with it —
 * so the two groups claim disjoint job types and cannot interfere.
 */

/** Image work. Concurrency 2-3. */
export const WORKER_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  enhance_images: enhanceImages,
  generate_og: generateOg,
  depth_map: depthMap,
};

/** Puppeteer only. Concurrency 1, memory capped, aggressive restart. */
export const PDF_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  render_pdf: renderPdf,
  render_story: renderStory,
  render_card: renderCard,
};

export function handlersFor(role: 'worker' | 'pdf'): Partial<Record<JobType, JobHandler>> {
  return role === 'pdf' ? PDF_HANDLERS : WORKER_HANDLERS;
}
