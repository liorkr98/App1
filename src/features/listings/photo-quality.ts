import { PHOTO_ROOMS, type PhotoRoom } from './photo-rooms.js';

/**
 * What the phone can tell about a photograph without sending it anywhere
 * (P6, decided: on-device only — no vision vendor).
 *
 * Measured on copies the editor draws while stripping EXIF, so it costs two
 * more drawImage calls, not a decode:
 *
 *   mean       average luminance, 0–255 (Rec. 709 weights), on ≈256 px
 *   sharpness  variance of the Laplacian — the standard blur measure — on a
 *              384 px centre crop of a 1024 px copy. Measured small, a
 *              shaken frame looks sharp: shrinking a photo shrinks its blur
 *              with it. Calibrated on the fixtures upscaled to 2400 px:
 *              197–461 as shot, ≈30 after a 3 px blur, ≈6 after 8 px
 *   hash       a 64-bit difference hash (dHash) as 16 hex characters; two
 *              frames within a few bits are the same shot taken twice
 *
 * Flags are advice shown on the thumbnail, never a blocker: an agent may
 * have a reason to keep a dark photograph, and the page is theirs.
 */
export interface PhotoCheck {
  mean: number;
  sharpness: number;
  hash: string;
  /** The ORIGINAL's short edge, before our resize. */
  shortEdge: number;
  landscape: boolean;
}

export type PhotoFlag = 'dark' | 'blurry' | 'small' | 'duplicate';

export const DARK_BELOW = 55;
export const BLURRY_BELOW = 15;
export const SMALL_BELOW = 900;
export const DUPLICATE_WITHIN = 6;

/** Luminance per pixel from RGBA bytes. */
export function grayscale(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = 0.2126 * rgba[o]! + 0.7152 * rgba[o + 1]! + 0.0722 * rgba[o + 2]!;
  }
  return out;
}

export function meanOf(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  return values.length > 0 ? sum / values.length : 0;
}

/** Variance of the 4-neighbour Laplacian over the interior. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Box-average a grayscale image down to w × h. */
function shrink(gray: ArrayLike<number>, width: number, height: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += gray[yy * width + xx]!;
      out.push(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

/** dHash: 9 × 8 samples, one bit per horizontal step, as 16 hex chars. */
export function differenceHash(gray: ArrayLike<number>, width: number, height: number): string {
  const s = shrink(gray, width, height, 9, 8);
  let hex = '';
  for (let row = 0; row < 8; row++) {
    let nibbleHi = 0;
    let nibbleLo = 0;
    for (let col = 0; col < 8; col++) {
      const bit = s[row * 9 + col]! > s[row * 9 + col + 1]! ? 1 : 0;
      if (col < 4) nibbleHi = (nibbleHi << 1) | bit;
      else nibbleLo = (nibbleLo << 1) | bit;
    }
    hex += nibbleHi.toString(16) + nibbleLo.toString(16);
  }
  return hex;
}

export function hammingHex(a: string, b: string): number {
  let bits = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits + Math.abs(a.length - b.length) * 4;
}

/** The whole measurement, from the small copy's RGBA and the original's size. */
export function checkPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  original: { width: number; height: number },
  detail?: { rgba: ArrayLike<number>; width: number; height: number },
): PhotoCheck {
  const gray = grayscale(rgba, width, height);
  const sharpness = detail
    ? laplacianVariance(grayscale(detail.rgba, detail.width, detail.height), detail.width, detail.height)
    : laplacianVariance(gray, width, height);
  return {
    mean: Math.round(meanOf(gray)),
    sharpness: Math.round(sharpness),
    hash: differenceHash(gray, width, height),
    shortEdge: Math.min(original.width, original.height),
    landscape: original.width >= original.height,
  };
}

/** Advice for one photograph; `others` are the hashes of the photos before it. */
export function photoFlags(check: PhotoCheck, others: readonly string[] = []): PhotoFlag[] {
  const flags: PhotoFlag[] = [];
  if (check.mean < DARK_BELOW) flags.push('dark');
  if (check.sharpness < BLURRY_BELOW) flags.push('blurry');
  if (check.shortEdge < SMALL_BELOW) flags.push('small');
  if (others.some((hash) => hammingHex(hash, check.hash) <= DUPLICATE_WITHIN)) flags.push('duplicate');
  return flags;
}

/**
 * How good a cover this would make. The WhatsApp card is cut from the cover
 * (1200 × 630), so landscape matters most; then light and sharpness; then
 * the rooms a buyer opens a listing to see first.
 */
export function coverScore(check: PhotoCheck | undefined, room?: PhotoRoom): number {
  if (!check) return 0;
  let score = check.landscape ? 40 : 0;
  score += Math.max(0, 25 - Math.abs(check.mean - 135) / 4);
  score += Math.min(20, check.sharpness / 20);
  if (room === 'living' || room === 'outdoor') score += 15;
  if (check.mean < DARK_BELOW || check.sharpness < BLURRY_BELOW) score -= 40;
  return score;
}

export interface OrderItem {
  id: string;
  room?: PhotoRoom | undefined;
  check?: PhotoCheck | undefined;
}

/**
 * "סידור מומלץ": the best cover first, then the walk through the home in
 * PHOTO_ROOMS order, unnamed photographs last. Stable inside each group, so
 * the agent's own order survives wherever this has no opinion.
 *
 * Index 0 is the cover and, in RTL, the RIGHTMOST thumbnail (CLAUDE.md §4.4).
 */
export function suggestedOrder<T extends OrderItem>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  let best = 0;
  items.forEach((item, index) => {
    if (coverScore(item.check, item.room) > coverScore(items[best]!.check, items[best]!.room)) best = index;
  });
  const cover = items[best]!;
  const rank = (item: T) => (item.room ? PHOTO_ROOMS.indexOf(item.room) : PHOTO_ROOMS.length);
  const rest = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== best)
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
  return [cover, ...rest];
}
