/**
 * The silent film over photographs a listing already has.
 *
 * The numbers are shared with the offline ffmpeg script
 * (scripts/make-video.py) and every surface that draws the film: the page,
 * the editor preview and the story file. Four motions in turn.
 *
 * CALMER SINCE 12 OCT 2026. The owner: "the video is doing too much zoom".
 * It was 12% in 3.2s; property films that feel expensive move about 1% a
 * second.
 *
 * PACED LIKE A REEL SINCE 13 OCT 2026. Listing reels hold a photograph for
 * 2.5–3 seconds and run 15–30 seconds; at 4.8s a still, eight photographs
 * took half a minute and felt slow. Now 3.2s a still with a 0.6s
 * crossfade (about 2.6s each), up to ten photographs, and no film at all
 * under three — one photograph that barely moves is not a video. Motion
 * eases in and out (smoothstep) so nothing starts or stops with a jolt, and
 * stays near 1% a second: 3% over a push, 4% held through a pan that
 * travels 2% (never more than the zoom leaves room for, so no edge shows).
 *
 * A pan in the script starts already zoomed, which crops the frame the agent
 * composed. Here every motion is described from scale 1. A pull-out is the
 * one move that is zoomed at the start, because that is the move; the first
 * still is always a push-in, so the film opens on the framed photograph.
 */

export const FILM_STILL_SEC = 3.2;
export const FILM_FADE_SEC = 0.6;
/** How far a push-in goes (and a pull-out starts): 1 + this. */
export const FILM_ZOOM = 0.03;
/** The zoom a pan holds, and how far it travels as a fraction of the width. */
export const FILM_PAN_ZOOM = 0.04;
export const FILM_PAN_TRAVEL = 0.02;
/** The share of a pan spent zooming before it travels. */
export const FILM_PAN_LEAD = 0.2;
export const FILM_MIN = 3;
export const FILM_MAX = 10;
export const FILM_FPS = 30;

export const FILM_MOTIONS = ['in', 'out', 'panRight', 'panLeft'] as const;
export type FilmMotion = (typeof FILM_MOTIONS)[number];

export interface FilmFrame {
  index: number;
  motion: FilmMotion;
  /** Seconds from the start, including the crossfade into this still. */
  start: number;
}

/** Cover first, then the published order, never more than FILM_MAX. */
export function filmFrames(count: number): FilmFrame[] {
  const whole = Math.max(0, Math.floor(count));
  const n = whole < FILM_MIN ? 0 : Math.min(FILM_MAX, whole);
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
  const p = ease(Math.min(1, Math.max(0, progress)));
  if (motion === 'in') return { scale: 1 + FILM_ZOOM * p, shift: 0 };
  if (motion === 'out') return { scale: 1 + FILM_ZOOM - FILM_ZOOM * p, shift: 0 };
  const lead = FILM_PAN_LEAD;
  const zoom = p < lead ? 1 + FILM_PAN_ZOOM * (p / lead) : 1 + FILM_PAN_ZOOM;
  const travel = p < lead ? 0 : ((p - lead) / (1 - lead)) * FILM_PAN_TRAVEL;
  const shift = motion === 'panRight' ? travel : -travel;
  return { scale: zoom, shift: shift === 0 ? 0 : shift };
}

/** Smoothstep: starts and stops at rest, the same curve as CSS ease-in-out, near enough. */
export function ease(t: number): number {
  return t * t * (3 - 2 * t);
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

/** The most of a photograph's width or height the story file may cut away. */
export const FILM_MAX_CROP = 0.3;

/**
 * How a photograph sits in the vertical story file (13 Oct 2026, the owner:
 * "fill when it fits"). Listing reels fill the frame; a wide photograph
 * cropped to 9:16 keeps less than half its width, which is the "too much
 * zoom" of 12 Oct. So: fill the frame when that cuts no more than
 * FILM_MAX_CROP of the photograph; otherwise draw it as large as that crop
 * allows, over its own blurred copy. Never more than FILM_MAX_CROP is lost.
 */
export function filmFit(image: FilmRect, frame: FilmRect, maxCrop = FILM_MAX_CROP): FilmRect {
  if (image.width <= 0 || image.height <= 0) return { width: frame.width, height: frame.height };
  const cover = Math.max(frame.width / image.width, frame.height / image.height);
  const contain = Math.min(frame.width / image.width, frame.height / image.height);
  // The scale at which exactly maxCrop of the overflowing side is cut.
  const limit = contain / (1 - maxCrop);
  const fit = Math.min(cover, limit);
  return { width: image.width * fit, height: image.height * fit };
}
