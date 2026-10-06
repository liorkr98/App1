/**
 * The arithmetic behind the share images the agent's own browser draws.
 *
 * Until 6 October 2026 the WhatsApp card and the story image were
 * screenshots taken by Puppeteer on Fly.io. Fly is gone (it cost more than
 * the product earns), so the editor now draws both on a canvas at publish
 * and uploads them (web/src/lib/share-draw.ts). Everything here is the part
 * of that drawing that can be wrong without a browser: where a line breaks,
 * which part of the photograph survives the crop, and what the file is
 * called. Pure, so it is tested with node:test.
 */

/** Width of a string in canvas pixels, at whatever font is current. */
export type Measure = (text: string) => number;

/**
 * Breaks text into lines no wider than `maxWidth`, at spaces.
 *
 * At most `maxLines`; text that does not fit ends its last line with "…"
 * rather than running off the card. A single word wider than the line is
 * kept whole — Hebrew words are short, and cutting one mid-word reads worse
 * than letting it touch the margin.
 */
export function wrapLines(text: string, maxWidth: number, measure: Measure, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0 || maxLines < 1) return [];

  const lines: string[] = [];
  let current = '';
  let index = 0;
  for (; index < words.length; index += 1) {
    const word = words[index]!;
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }

  if (lines.length < maxLines) {
    lines.push(current);
    return lines;
  }

  // Out of lines with words left: the last line carries the ellipsis.
  let last = lines[maxLines - 1]!;
  while (last.includes(' ') && measure(`${last}…`) > maxWidth) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  lines[maxLines - 1] = `${last}…`;
  return lines;
}

/**
 * The largest font size, from `sizes` (largest first), at which `text`
 * fits in `maxLines` lines. The smallest size when none fits; wrapLines
 * then ends it with "…".
 */
export function fitSize(
  text: string,
  sizes: readonly number[],
  maxWidth: number,
  measureAt: (size: number) => Measure,
  maxLines: number,
): number {
  for (const size of sizes) {
    const measure = measureAt(size);
    const lines = wrapLines(text, maxWidth, measure, maxLines);
    if (!lines.some((line) => line.endsWith('…') && !text.trim().endsWith('…'))) return size;
  }
  return sizes[sizes.length - 1] ?? 16;
}

export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The source rectangle `object-fit: cover` would show, with the focal point
 * (percent, 50/50 = centre) playing `object-position`. The listing page crops
 * the cover the same way, so the card and the page agree on what matters.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
  focalX = 50,
  focalY = 50,
): Crop {
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const sw = Math.min(sourceWidth, boxWidth / scale);
  const sh = Math.min(sourceHeight, boxHeight / scale);
  const clamp = (value: number) => Math.min(100, Math.max(0, value)) / 100;
  return {
    sx: (sourceWidth - sw) * clamp(focalX),
    sy: (sourceHeight - sh) * clamp(focalY),
    sw,
    sh,
  };
}

export type ShareImageKind = 'card' | 'story';

/**
 * Where an image goes in the `derived` bucket.
 *
 * The browser may write ONLY under `{listingId}/browser/` (migration 0023),
 * which is also what keeps it from overwriting anything else in the bucket.
 * The content key is in the FILENAME, never a query string (CLAUDE.md §6):
 * WhatsApp caches a preview by URL, so new content must be a new file.
 */
export function shareImagePath(
  listingId: string,
  kind: ShareImageKind,
  slug: string,
  key: string,
  extension: 'webp' | 'jpg',
): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '');
  return `${safe(listingId)}/browser/${kind}-${safe(slug)}-${safe(key)}.${extension}`;
}

/** CLAUDE.md §6: the WhatsApp card is under 300 KB. */
export const CARD_MAX_BYTES = 300 * 1024;

/** Encoder qualities to try, best first, until the card is under the cap. */
export const CARD_QUALITIES = [0.84, 0.74, 0.64, 0.54] as const;
