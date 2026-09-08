import { db } from './db.js';
import { JobFailure } from './types.js';

/**
 * Writes back into listings.media.
 *
 * Every one of these is an RPC rather than a read-modify-write from here, and
 * that is the whole point. Rooms stitch CONCURRENTLY — one job per scene, two
 * or three at a time on the worker machine. Reading media, splicing a scene in
 * and writing it back would lose whichever scene finished second, and it would
 * do so intermittently, which is the worst possible way to lose it.
 *
 * The functions in 0005_attach_immersive.sql take a row lock and merge inside
 * the database, so the ordering problem does not exist.
 */

/** Mirrors PanoScene in src/types/listing.ts, plus the size the page needs. */
export interface PanoScenePayload {
  id: string;
  roomKey: string;
  label: string;
  panoUrl: string;
  thumbUrl: string;
  yaw?: number;
  pitch?: number;
  /** Encoded size, summed by the RPC into the tour's payloadMb. */
  bytes: number;
}

/** Mirrors SpinImmersive in src/types/listing.ts. */
export interface SpinPayload {
  type: 'spin';
  frames: string[];
  spriteUrl?: string;
  frameCount: number;
  payloadMb?: number;
}

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await db().rpc(name, args);

  if (error) {
    // Retryable: the write is idempotent by construction — attaching the same
    // scene twice replaces it rather than duplicating it — so a retry after a
    // dropped connection is safe.
    throw new JobFailure(`${name}_failed`, true);
  }
}

export function attachPanoScene(listingId: string, scene: PanoScenePayload): Promise<void> {
  return call('attach_pano_scene', { p_listing_id: listingId, p_scene: scene });
}

export function attachSpin(listingId: string, spin: SpinPayload): Promise<void> {
  return call('attach_spin', { p_listing_id: listingId, p_spin: spin });
}

export function attachPdf(listingId: string, url: string): Promise<void> {
  return call('attach_pdf', { p_listing_id: listingId, p_url: url });
}
