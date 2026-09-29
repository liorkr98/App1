import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { db } from '../db.js';
import { publicDerivedUrl } from '../depth/allow.js';
import { env } from '../env.js';
import { attachMediaUrl } from '../rpc.js';
import { upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * depth_map (P7): a greyscale depth map of the cover, for the depth hero.
 *
 * Depth Anything V2 Small (Apache-2.0), 8-bit quantised ONNX, run on the CPU
 * through @huggingface/transformers. The model is baked into the image at
 * build time (scripts/fetch-model.mjs, Dockerfile) and remote downloads are
 * switched off here: a job must never reach out to a model hub.
 *
 * The map is recorded WITH the cover URL it was computed from
 * (media.depth = {url, cover}); the page draws it only while that is still
 * the cover (rich-media.ts depthFor), so a replaced cover never moves over
 * the old room's depth.
 *
 * NOT RUN IN THIS REPOSITORY'S SANDBOX: the model hub is unreachable there.
 * Verified on Fly or not at all — see the PR.
 */
const MODEL = 'onnx-community/depth-anything-v2-small';
const MAP_EDGE = 512;

type Estimator = (input: unknown) => Promise<{ depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels?: number } }>;
let estimator: Promise<Estimator> | undefined;

async function load(): Promise<Estimator> {
  const transformers = await import('@huggingface/transformers');
  transformers.env.allowRemoteModels = false;
  transformers.env.cacheDir = process.env.MODEL_CACHE_DIR ?? '/app/.cache/models';
  return (await transformers.pipeline('depth-estimation', MODEL, { dtype: 'q8' })) as unknown as Estimator;
}

export async function depthMap({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  // The cover is read from the row, not the payload, and must be ours.
  const { data: row, error } = await db().from('listings').select('media').eq('id', job.listing_id).single();
  if (error || !row) throw new JobFailure('listing_unavailable', true);
  const cover = (row.media as { cover?: { url?: unknown } } | null)?.cover?.url;
  const coverUrl = publicDerivedUrl(cover, env.supabaseUrl);
  if (!coverUrl) throw new JobFailure('cover_not_allowed', false);

  const response = await fetch(coverUrl);
  if (!response.ok) throw new JobFailure('cover_unavailable', true);
  const bytes = Buffer.from(await response.arrayBuffer());
  await progress(20);

  const transformers = await import('@huggingface/transformers');
  const input = await sharp(bytes).resize(MAP_EDGE, MAP_EDGE, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = new transformers.RawImage(new Uint8ClampedArray(input.data), input.info.width, input.info.height, 3);

  estimator ??= load();
  const { depth } = await (await estimator)(image);
  await progress(70);

  const map = await sharp(Buffer.from(depth.data), {
    raw: { width: depth.width, height: depth.height, channels: (depth.channels ?? 1) as 1 },
  })
    .resize(input.info.width, input.info.height)
    .greyscale()
    .webp({ quality: 80 })
    .toBuffer();

  const hash = createHash('sha256').update(coverUrl).update(map).digest('hex').slice(0, 8);
  const { publicUrl } = await upload(`${job.listing_id}/depth/${hash}.webp`, map, 'image/webp');
  await attachMediaUrl(job.listing_id, 'depth', { url: publicUrl, cover: coverUrl });
  await progress(100);

  return { url: publicUrl, bytes: map.byteLength };
}
