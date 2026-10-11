/**
 * The silent film over photographs a listing already has.
 *
 * The numbers are the offline ffmpeg script (scripts/make-video.py): 3.2s on
 * each still, an 0.8s crossfade, four motions in turn. That script runs on
 * the owner's machine. This module is what the page, the preview and the
 * optional story file all read, so they cannot drift apart.
 *
 * A pan in the script starts already zoomed, which crops the frame the agent
 * composed. Here every motion is described from scale 1. A pull-out is the
 * one move that is zoomed at the start, because that is the move; the first
 * still is always a push-in, so the film opens on the framed photograph.
 */

export const FILM_STILL_SEC = 3.2;
export const FILM_FADE_SEC = 0.8;
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

/** n × 3.2 − (n − 1) × 0.8. Empty is zero. */
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
  if (motion === 'in') return { scale: 1 + 0.12 * p, shift: 0 };
  if (motion === 'out') return { scale: 1.12 - 0.12 * p, shift: 0 };
  const zoom = p < 0.2 ? 1 + 0.08 * (p / 0.2) : 1.08;
  const travel = p < 0.2 ? 0 : ((p - 0.2) / 0.8) * 0.06;
  const shift = motion === 'panRight' ? travel : -travel;
  return { scale: zoom, shift: shift === 0 ? 0 : shift };
}
