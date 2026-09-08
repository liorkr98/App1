import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { attachSpin } from '../rpc.js';
import { downloadDerived, upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';
import { DEFAULT_FRAME_COUNT, gridFor } from '../video/angles.js';

/**
 * D3, second half — the sprite sheet.
 *
 * One request instead of 36. On Israeli cellular the difference is not the
 * bytes, it is the round trips: 36 sequential-ish requests against a CDN each
 * pay their own latency, and the spin sits half-loaded while the user drags a
 * frame that is not there yet.
 *
 * The layout MUST match gridFor() in web/src/lib/viewers/spin.ts. The copy in
 * ../video/angles.ts is the one asserted by the unit test.
 */

const WEBP_QUALITY = 78;

/**
 * Ceiling on the decoded sheet.
 *
 * A browser holds the whole sheet decompressed while the spin is on screen:
 * width x height x 4 bytes, regardless of how well it compressed. 12 megapixels
 * is about 48MB, which is already a lot to ask of the mid-range Android this
 * product is aimed at. Past that the tab is killed, and it is killed while the
 * user is looking at the car.
 */
const MAX_SHEET_PIXELS = 12_000_000;

interface SpritePayload {
  /** Paths inside `derived`, as returned by the extract_frames job. */
  frames?: string[];
  /** Public URLs for the same frames, kept as the viewer's fallback path. */
  frameUrls?: string[];
  frameCount?: number;
}

export async function buildSprite({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { frames, frameUrls, frameCount = DEFAULT_FRAME_COUNT } = job.payload as SpritePayload;

  if (!frames?.length) {
    throw new JobFailure('no_frames', false);
  }

  const { columns, rows } = gridFor(frames.length);

  const tiles = await Promise.all(
    frames.map(async (path) => downloadDerived(job.listing_id, path)),
  );
  await progress(40);

  const first = tiles[0];
  if (!first) {
    throw new JobFailure('no_frames', false);
  }

  const { width, height } = await sharp(first).metadata();
  if (!width || !height) {
    throw new JobFailure('frame_unreadable', false);
  }

  let cellWidth = width;
  let cellHeight = height;

  // Shrink the cell rather than refusing the job. A slightly smaller spin is
  // a working spin; a job that fails here leaves the seller with nothing and
  // no way to act on the reason.
  const scale = Math.sqrt(MAX_SHEET_PIXELS / (columns * cellWidth * rows * cellHeight));
  if (scale < 1) {
    cellWidth = Math.max(Math.floor(cellWidth * scale), 1);
    cellHeight = Math.max(Math.floor(cellHeight * scale), 1);
  }

  // Every cell is forced to the same box. Frames from one video are already
  // identical, but a mismatch here does not fail — it shifts every subsequent
  // frame by a few pixels, and the spin wobbles for reasons nobody can see.
  const cells = await Promise.all(
    tiles.map((tile) =>
      sharp(tile).resize({ width: cellWidth, height: cellHeight, fit: 'cover' }).toBuffer(),
    ),
  );
  await progress(70);

  const sheet = await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(
      cells.map((input, index) => ({
        input,
        // Row-major, left to right. Not a reading direction — a pixel grid
        // addressed the same way the viewer's background-position addresses it.
        left: (index % columns) * cellWidth,
        top: Math.floor(index / columns) * cellHeight,
      })),
    )
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  // Content hash in the filename, for the same reason as the OG card: CDNs and
  // in-app browsers cache hard, and a query string busts nothing.
  const hash = createHash('sha256').update(sheet).digest('hex').slice(0, 8);

  const { publicUrl: spriteUrl } = await upload(
    `${job.listing_id}/spin/sprite-${hash}.webp`,
    sheet,
    'image/webp',
  );
  await progress(90);

  await attachSpin(job.listing_id, {
    type: 'spin',
    frames: frameUrls ?? [],
    spriteUrl,
    frameCount: frames.length,
    payloadMb: Number((sheet.byteLength / 1_048_576).toFixed(1)),
  });

  await progress(100);

  return {
    spriteUrl,
    columns,
    rows,
    cellWidth,
    cellHeight,
    frameCount: frames.length,
    declaredFrameCount: frameCount,
    bytes: sheet.byteLength,
  };
}
