/**
 * The rectangle the agent puts over a licence plate (19 Oct 2026), in
 * fractions of the photograph: x and y from its physical top-left corner,
 * whatever the page direction, because a photograph has no reading order.
 *
 * The photo check says a plate is there but not where (photo-review.ts), so
 * the agent places it; these rules keep the rectangle inside the photograph
 * and big enough to cover a plate.
 */
export interface PlateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Narrower or shorter than this covers no plate a buyer could read. */
export const PLATE_MIN = 0.04;

/** Where a plate usually is in a car photograph: low and in the middle. */
export const PLATE_START: PlateRect = { x: 0.36, y: 0.64, w: 0.28, h: 0.11 };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function clampRect(rect: PlateRect): PlateRect {
  const w = clamp(Number.isFinite(rect.w) ? rect.w : PLATE_START.w, PLATE_MIN, 1);
  const h = clamp(Number.isFinite(rect.h) ? rect.h : PLATE_START.h, PLATE_MIN, 1);
  return {
    x: clamp(Number.isFinite(rect.x) ? rect.x : 0, 0, 1 - w),
    y: clamp(Number.isFinite(rect.y) ? rect.y : 0, 0, 1 - h),
    w,
    h,
  };
}

export function moveRect(rect: PlateRect, dx: number, dy: number): PlateRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
}

/** Grows or shrinks from the top-left corner, which stays put. */
export function resizeRect(rect: PlateRect, dw: number, dh: number): PlateRect {
  const w = clamp(rect.w + dw, PLATE_MIN, 1 - rect.x);
  const h = clamp(rect.h + dh, PLATE_MIN, 1 - rect.y);
  return clampRect({ ...rect, w, h });
}

/**
 * The mosaic's cell, in pixels, for a rectangle this many pixels wide: about
 * eight across, so each cell is wider than a plate's character and nothing
 * on it can be read back, and never under 8 pixels.
 */
export function mosaicCell(widthPx: number): number {
  return Math.max(8, Math.round(widthPx / 8));
}
