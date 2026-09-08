import { join } from 'node:path';

import sharp from 'sharp';

import {
  DEFAULT_FRAME_COUNT,
  resampleByAngle,
  resampleByTime,
  SweepTooShort,
  type HeadingSample,
} from '../video/angles.js';
import { extractFrame, probeDuration, withTempVideo } from '../video/ffmpeg.js';
import { downloadOriginal, stripMetadata, upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * D3, first half — pulling 36 frames out of the walk-around video.
 *
 * The frames are uploaded individually as well as being fed to the sprite
 * builder, because web/src/lib/viewers/spin.ts keeps a frames fallback for the
 * case where no sheet exists. Both halves of that contract are real.
 */

/**
 * Per-frame width.
 *
 * The ceiling is the sprite sheet, not this file: 36 frames at 512 wide make a
 * 6x6 sheet of roughly 3072x2300, which a phone decodes into about 28MB of
 * RAM. Going to 768 would nearly double that, on the same devices the panorama
 * cap exists to protect.
 */
const FRAME_WIDTH = 512;
const WEBP_QUALITY = 80;

interface FramesPayload {
  /** Path in `originals` of the walk-around video. */
  video?: string;
  /** Device heading over time, if the capture flow recorded it. */
  headings?: HeadingSample[];
  frameCount?: number;
}

export async function extractFrames({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { video, headings, frameCount = DEFAULT_FRAME_COUNT } = job.payload as FramesPayload;

  if (!video) {
    throw new JobFailure('no_video', false);
  }

  const source = await downloadOriginal(job.listing_id, video);
  await progress(10);

  return withTempVideo(source, async (path, directory) => {
    const duration = await probeDuration(path);

    // Angular resampling when the capture flow recorded a heading track,
    // uniform time sampling when it did not. Which one ran is reported, not
    // hidden: a spin built from uniform sampling stutters wherever the seller
    // slowed down, and that reads as a rendering bug rather than a capture
    // one unless someone can see this flag.
    let timestamps: number[];
    let resampled = false;
    let sweepDegrees: number | null = null;

    if (headings?.length) {
      try {
        const result = resampleByAngle(headings, frameCount);
        timestamps = result.timestamps;
        sweepDegrees = result.sweepDegrees;
        resampled = true;
      } catch (error) {
        if (error instanceof SweepTooShort) {
          // Permanent. The seller did not walk far enough round the vehicle,
          // and the same video will never produce a complete spin.
          throw new JobFailure('incomplete_sweep', false);
        }
        throw error;
      }
    } else {
      timestamps = resampleByTime(duration, frameCount);
    }

    const frames: string[] = [];
    // Public URLs are what the page consumes; storage paths are what the
    // sprite job needs. Returning both means the enqueuer does not have to
    // reconstruct one from the other and get the convention subtly wrong.
    const paths: string[] = [];

    for (const [index, seconds] of timestamps.entries()) {
      // Clamp: an interpolated timestamp can land a few milliseconds past the
      // final sample, and ffmpeg returns nothing at all past the end.
      const at = Math.min(seconds, Math.max(duration - 0.05, 0));
      const still = await extractFrame(path, at, join(directory, `frame-${index}.jpg`));

      const encoded = await stripMetadata(sharp(still))
        .resize({ width: FRAME_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const { path: stored, publicUrl } = await upload(
        `${job.listing_id}/spin/frame-${String(index).padStart(2, '0')}.webp`,
        encoded,
        'image/webp',
      );

      frames.push(publicUrl);
      paths.push(stored);
      await progress(10 + ((index + 1) / timestamps.length) * 90);
    }

    return {
      frames,
      paths,
      frameCount: frames.length,
      resampled,
      sweepDegrees: sweepDegrees === null ? null : Number(sweepDegrees.toFixed(1)),
      durationSeconds: Number(duration.toFixed(2)),
    };
  });
}
