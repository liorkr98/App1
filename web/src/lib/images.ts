import type { Image } from '@app/types/listing';

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

function variant(url: string, width: number): string {
  const dot = url.lastIndexOf('.');
  const base = dot === -1 ? url : url.slice(0, dot);
  return `${base}-${width}.webp`;
}

export function srcset(url: string, widths: readonly number[]): string {
  return widths.map((width) => `${variant(url, width)} ${width}w`).join(', ');
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
