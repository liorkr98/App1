import sharp from 'sharp';

import {
  applyTranspose,
  directionTables,
  equatorialCoverage,
  featherWeight,
  focalLength,
  projectToImage,
  rotationMatrix,
  sampleRgb,
  type Attitude,
} from '../pano/project.js';
import { attachPanoScene } from '../rpc.js';
import { downloadOriginal, stripMetadata, upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * D2 — panorama stitching.
 *
 * One job per room. scope_key carries the scene id, so a room that fails
 * leaves the other rooms alone and the tour publishes with what worked (D7).
 *
 * The maths lives in ../pano/project.ts and is unit-tested there. What is here
 * is the pixel bookkeeping: download, reproject, blend, fill, encode, attach.
 */

/**
 * Output size.
 *
 * The cap is not a preference. Photo Sphere Viewer has no multi-resolution
 * tiling, so the whole equirectangular becomes one WebGL texture; past roughly
 * 6000x3000 a mid-range Android phone either freezes for seconds or loses the
 * context outright. web/src/lib/viewers/guards.ts enforces the same number on
 * the client, and these two must not drift apart.
 */
export const MAX_WIDTH = 6000;
export const MAX_HEIGHT = 3000;
const DEFAULT_WIDTH = 4096;

/**
 * Working resolution for each source shot.
 *
 * Downscaling first is not a shortcut. The output is roughly 11 pixels per
 * degree; a 12-megapixel phone shot across 68 degrees is about 60. Sampling
 * from the full-size original would alias badly, because bilinear sampling
 * only looks at a 2x2 neighbourhood and ignores the other 28 pixels that
 * belong in the same output pixel. Resizing with libvips averages them
 * properly first.
 */
const SHOT_WIDTH = 1600;

/** Below this, the seller did not turn far enough for a usable room. */
const MIN_EQUATORIAL_COVERAGE = 0.9;

const WEBP_QUALITY = 82;
const THUMB_WIDTH = 512;

interface Shot extends Attitude {
  /** Path inside `originals`, within this listing's folder. */
  path: string;
  /** Horizontal field of view in degrees, as the capture flow measured it. */
  hfov?: number;
}

interface StitchPayload {
  scene?: {
    id: string;
    roomKey: string;
    label: string;
    yaw?: number;
    pitch?: number;
  };
  shots?: Shot[];
  width?: number;
}

/** Typical phone main camera. Only used when the capture flow sends nothing. */
const DEFAULT_HFOV = 68;

export async function stitchPanorama({
  job,
  progress,
}: JobContext): Promise<Record<string, unknown>> {
  const { scene, shots, width: requestedWidth } = job.payload as StitchPayload;

  if (!scene?.id || !scene.label) {
    throw new JobFailure('no_scene', false);
  }
  if (!shots?.length) {
    throw new JobFailure('no_shots', false);
  }

  const width = Math.min(Math.max(requestedWidth ?? DEFAULT_WIDTH, 1024), MAX_WIDTH);
  const height = Math.min(Math.round(width / 2), MAX_HEIGHT);

  // Float32 rather than Uint8: contributions are summed before they are
  // divided by the accumulated weight, and a sum of overlapping shots
  // overflows a byte immediately.
  const accumulator = new Float32Array(width * height * 3);
  const weights = new Float32Array(width * height);
  const tables = directionTables(width, height);
  const sample = new Float64Array(3);

  for (const [index, shot] of shots.entries()) {
    await blendShot(job.listing_id, shot, { accumulator, weights, tables, width, height, sample });
    // Stitching is the slowest thing the pipeline does and the app shows this
    // number to a seller who is standing in the room waiting. 80% of the bar
    // is the shots; the rest is encoding and upload.
    await progress(((index + 1) / shots.length) * 80);
  }

  const coverage = equatorialCoverage(weights, width, height);
  if (coverage < MIN_EQUATORIAL_COVERAGE) {
    // Permanent: retrying the same photographs produces the same hole. The
    // seller has to re-shoot, and telling them that now is kinder than four
    // silent retries followed by a panorama with a wall missing.
    throw new JobFailure('insufficient_coverage', false);
  }

  const pixels = resolve(accumulator, weights, width, height);

  const panorama = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const thumbnail = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .resize({ width: THUMB_WIDTH })
    .webp({ quality: 70 })
    .toBuffer();

  await progress(90);

  const { publicUrl: panoUrl } = await upload(
    `${job.listing_id}/pano/${scene.id}.webp`,
    panorama,
    'image/webp',
  );
  const { publicUrl: thumbUrl } = await upload(
    `${job.listing_id}/pano/${scene.id}-thumb.webp`,
    thumbnail,
    'image/webp',
  );

  await attachPanoScene(job.listing_id, {
    id: scene.id,
    roomKey: scene.roomKey,
    label: scene.label,
    panoUrl,
    thumbUrl,
    ...(scene.yaw === undefined ? {} : { yaw: scene.yaw }),
    ...(scene.pitch === undefined ? {} : { pitch: scene.pitch }),
    bytes: panorama.byteLength,
  });

  await progress(100);

  return {
    sceneId: scene.id,
    width,
    height,
    bytes: panorama.byteLength,
    coverage: Number(coverage.toFixed(3)),
    shots: shots.length,
  };
}

interface Canvas {
  accumulator: Float32Array;
  weights: Float32Array;
  tables: ReturnType<typeof directionTables>;
  width: number;
  height: number;
  sample: Float64Array;
}

/** Reprojects one shot onto the canvas, weighted so seams do not show. */
async function blendShot(listingId: string, shot: Shot, canvas: Canvas): Promise<void> {
  const { accumulator, weights, tables, width, height, sample } = canvas;

  const original = await downloadOriginal(listingId, shot.path);

  const { data, info } = await stripMetadata(sharp(original))
    .resize({ width: SHOT_WIDTH, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const focal = focalLength(info.width, shot.hfov ?? DEFAULT_HFOV);
  const rotation = rotationMatrix(shot);

  const { sinLon, cosLon, sinLat, cosLat } = tables;

  for (let v = 0; v < height; v += 1) {
    const sinV = sinLat[v] ?? 0;
    const cosV = cosLat[v] ?? 0;
    const row = v * width;

    for (let u = 0; u < width; u += 1) {
      const direction = [
        cosV * (sinLon[u] ?? 0),
        sinV,
        cosV * (cosLon[u] ?? 0),
      ] as const;

      const camera = applyTranspose(rotation, direction);
      const point = projectToImage(camera, focal, info.width, info.height);
      if (!point) continue;

      const weight = featherWeight(point, info.width, info.height);
      sampleRgb(source, info.width, info.height, point.x, point.y, sample);

      const target = (row + u) * 3;
      accumulator[target] = (accumulator[target] ?? 0) + (sample[0] ?? 0) * weight;
      accumulator[target + 1] = (accumulator[target + 1] ?? 0) + (sample[1] ?? 0) * weight;
      accumulator[target + 2] = (accumulator[target + 2] ?? 0) + (sample[2] ?? 0) * weight;
      weights[row + u] = (weights[row + u] ?? 0) + weight;
    }
  }
}

/**
 * Divides out the weights and fills what nobody photographed.
 *
 * The sky and floor of a room sweep are genuinely missing — nobody points a
 * phone straight up. Left black they read as a hole; the viewer looks broken.
 *
 * The fill is the AVERAGE COLOUR of the nearest captured row, stretched
 * outward. That is deliberately detail-free: it reads as a soft ceiling or
 * floor tone and cannot be mistaken for something that was photographed.
 * Extending the nearest row's actual pixels would look better and would be
 * fabrication — smeared detail that a buyer could read as real. The locked
 * decision is that immersive content is reconstructed, never generated, and a
 * flat tone is the honest side of that line.
 */
function resolve(
  accumulator: Float32Array,
  weights: Float32Array,
  width: number,
  height: number,
): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  const rowCovered = new Uint8Array(height);
  const rowMean = new Float64Array(height * 3);

  for (let v = 0; v < height; v += 1) {
    let counted = 0;
    let r = 0;
    let g = 0;
    let b = 0;

    for (let u = 0; u < width; u += 1) {
      const weight = weights[v * width + u] ?? 0;
      if (weight <= 0) continue;

      const target = (v * width + u) * 3;
      const source = target;
      const red = (accumulator[source] ?? 0) / weight;
      const green = (accumulator[source + 1] ?? 0) / weight;
      const blue = (accumulator[source + 2] ?? 0) / weight;

      pixels[target] = clampByte(red);
      pixels[target + 1] = clampByte(green);
      pixels[target + 2] = clampByte(blue);

      r += red;
      g += green;
      b += blue;
      counted += 1;
    }

    if (counted > 0) {
      rowCovered[v] = 1;
      rowMean[v * 3] = r / counted;
      rowMean[v * 3 + 1] = g / counted;
      rowMean[v * 3 + 2] = b / counted;
    }
  }

  fillUncoveredRows(pixels, weights, rowCovered, rowMean, width, height);

  return pixels;
}

function fillUncoveredRows(
  pixels: Buffer,
  weights: Float32Array,
  rowCovered: Uint8Array,
  rowMean: Float64Array,
  width: number,
  height: number,
): void {
  // Nearest covered row in each direction, so the zenith takes the ceiling's
  // tone and the nadir takes the floor's rather than both taking one of them.
  const nearest = new Int32Array(height).fill(-1);
  let last = -1;

  for (let v = 0; v < height; v += 1) {
    if (rowCovered[v]) last = v;
    nearest[v] = last;
  }

  last = -1;
  for (let v = height - 1; v >= 0; v -= 1) {
    if (rowCovered[v]) last = v;
    const above = nearest[v] ?? -1;
    if (above < 0 || (last >= 0 && last - v < v - above)) nearest[v] = last;
  }

  for (let v = 0; v < height; v += 1) {
    const donor = nearest[v] ?? -1;
    if (donor < 0) continue;

    for (let u = 0; u < width; u += 1) {
      if ((weights[v * width + u] ?? 0) > 0) continue;

      const target = (v * width + u) * 3;
      pixels[target] = clampByte(rowMean[donor * 3] ?? 0);
      pixels[target + 1] = clampByte(rowMean[donor * 3 + 1] ?? 0);
      pixels[target + 2] = clampByte(rowMean[donor * 3 + 2] ?? 0);
    }
  }
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
