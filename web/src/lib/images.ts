import type { Image } from '@/types/listing';

/**
 * Responsive image URLs.
 *
 * The Stage D pipeline emits WebP variants alongside the original, named
 * `{base}-{width}.webp`. The page only composes URLs — it never resizes at
 * build time, which keeps sharp out of the web workspace entirely and means
 * a build cannot fail because an image host was slow.
 */

export const HERO_WIDTHS = [400, 800, 1200] as const;
export const GALLERY_WIDTHS = [400, 800] as const;

/**
 * The URL of one width variant, or the original when there is none.
 *
 * THE BUG THIS FIXES. It used to take `url.lastIndexOf('.')` across the whole
 * string. For any URL whose path carries no file extension, the last dot is
 * in the HOST — so
 *
 *     https://placehold.co/900x1125/E4E0D6/6E6F66?text=+
 *
 * became `https://placehold-1200.webp`, a URL to nowhere. Every image on every
 * sample page was a broken link, which is why those pages rendered with no
 * photograph at all and the homepage preview showed an empty frame. The pages
 * still built, still passed every check, and still looked deliberate.
 *
 * A dot only marks an extension when it sits INSIDE the last path segment.
 * When it does not, the pipeline has produced no variants for this URL and
 * the honest answer is the URL as given.
 */
function variant(url: string, width: number): string {
  const marker = url.search(/[?#]/);
  const path = marker === -1 ? url : url.slice(0, marker);
  const suffix = marker === -1 ? '' : url.slice(marker);

  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');

  if (dot <= slash) return url;

  return `${path.slice(0, dot)}-${width}.webp${suffix}`;
}

/**
 * A srcset, or an empty string when no variants exist.
 *
 * Empty rather than a list of identical URLs at different widths: telling the
 * browser the same file is both 400w and 1200w is a lie it will act on, and
 * the caller omits the attribute instead.
 */
export function srcset(url: string, widths: readonly number[]): string {
  const composed = widths.map((width) => variant(url, width));
  if (composed.every((candidate) => candidate === url)) return '';

  return composed.map((candidate, index) => `${candidate} ${widths[index]}w`).join(', ');
}

/** Largest variant, used as the src fallback. */
export function largest(url: string, widths: readonly number[]): string {
  return variant(url, widths[widths.length - 1] ?? 800);
}

/**
 * Intrinsic width/height for the <img>, so the browser reserves the box
 * before the bytes arrive. Without these the page reflows as each image
 * loads, which is both a CLS penalty and visibly cheap.
 */
export function dimensions(image: Image): { width: number; height: number } {
  return { width: image.width, height: image.height };
}
