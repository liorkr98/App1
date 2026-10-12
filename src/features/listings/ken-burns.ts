/**
 * The silent film over photographs a listing already has.
 *
 * The numbers are shared with the offline ffmpeg script
 * (scripts/make-video.py): 4.8s on each still, a 1.2s crossfade, four
 * motions in turn.
 *
 * CALMER SINCE 12 OCT 2026. The owner: "the video is doing too much zoom".
 * It was 12% in 3.2s; property films that feel expensive move about 1% a
 * second. Now 4% over 4.8s, pans travel 2.5% at a 5% zoom (never more
 * than the zoom leaves room for, so no edge shows), and the fade is longer. That script runs on
 * the owner's machine. This module is what the page, the preview and the
 * optional story file all read, so they cannot drift apart.
 *
 * A pan in the script starts already zoomed, which crops the frame the agent
 * composed. Here every motion is described from scale 1. A pull-out is the
 * one move that is zoomed at the start, because that is the move; the first
 * still is always a push-in, so the film opens on the framed photograph.
 */

export const FILM_STILL_SEC = 4.8;
export const FILM_FADE_SEC = 1.2;
/** How far a push-in goes (and a pull-out starts): 1 + this. */
export const FILM_ZOOM = 0.04;
/** The zoom a pan holds, and how far it travels as a fraction of the width. */
export const FILM_PAN_ZOOM = 0.05;
export const FILM_PAN_TRAVEL = 0.025;
export const FILM_MAX = 8;
export const FILM_FPS = 30;

export const FILM_MOTIONS = ['in', 'out', 'panRight', 'panLeft'] as const;
export type FilmMotion = (typeof FILM_MOTIONS)[number];

export interface FilmFrame {
  index: number;
  motion: FilmMotion;
  /** Seconds from the start, including the crossfade into this still. */
  start: number;
}

/** Cover first, then the published order, never more than eight. */
export function filmFrames(count: number): FilmFrame[] {
  const n = Math.min(FILM_MAX, Math.max(0, Math.floor(count)));
  const step = FILM_STILL_SEC - FILM_FADE_SEC;
  return Array.from({ length: n }, (_, index) => ({
    index,
    motion: FILM_MOTIONS[index % FILM_MOTIONS.length]!,
    start: index * step,
  }));
}

/** n × still − (n − 1) × fade. Empty is zero. */
export function filmDuration(count: number): number {
  const n = filmFrames(count).length;
  if (n === 0) return 0;
  return n * FILM_STILL_SEC - (n - 1) * FILM_FADE_SEC;
}

/** `m:ss` for a caption. The caller puts it in <bdi>. */
export function filmClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

export interface FilmPose {
  /** 1 is the crop the agent framed. */
  scale: number;
  /** Fraction of the frame width, positive toward the physical right. */
  shift: number;
}

/**
 * Where one still sits at `progress` (0 at its first frame, 1 at its last).
 * The opening of `in` and of both pans is scale 1 and shift 0.
 */
export function filmPose(motion: FilmMotion, progress: number): FilmPose {
  const p = Math.min(1, Math.max(0, progress));
  if (motion === 'in') return { scale: 1 + FILM_ZOOM * p, shift: 0 };
  if (motion === 'out') return { scale: 1 + FILM_ZOOM - FILM_ZOOM * p, shift: 0 };
  const zoom = p < 0.2 ? 1 + FILM_PAN_ZOOM * (p / 0.2) : 1 + FILM_PAN_ZOOM;
  const travel = p < 0.2 ? 0 : ((p - 0.2) / 0.8) * FILM_PAN_TRAVEL;
  const shift = motion === 'panRight' ? travel : -travel;
  return { scale: zoom, shift: shift === 0 ? 0 : shift };
}

export interface FilmRect {
  width: number;
  height: number;
}

/**
 * The whole photograph inside the frame: as large as fits, never cropped.
 * A wide photo in a vertical film spans the width, with the rest of the
 * frame left for its blurred backdrop. Cropping to fill used to keep only
 * 42% of a 4:3 photo's width in a 9:16 film (12 Oct: "too much zoom").
 */
export function filmContain(image: FilmRect, frame: FilmRect): FilmRect {
  if (image.width <= 0 || image.height <= 0) return { width: frame.width, height: frame.height };
  const fit = Math.min(frame.width / image.width, frame.height / image.height);
  return { width: image.width * fit, height: image.height * fit };
}
