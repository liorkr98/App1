import { isPhotoRoom, type PhotoRoom } from './photo-rooms.js';

/**
 * The P7 media a listing may carry, validated on the way IN to the page —
 * from a row, from the editor, from the preview. Pure and tested; bad values
 * are dropped, never guessed at.
 */

/** One room drawn on the floor plan, in percent of the plan image. */
export interface PlanRoom {
  room: PhotoRoom;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLAN_ROOMS_MAX = 12;
/** Smaller than this, a rectangle is a slip of the finger, not a room. */
export const PLAN_ROOM_MIN = 3;

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : NaN);
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Rectangles inside the plan, one per room, at most twelve. A room drawn
 * twice keeps its LAST rectangle (the agent corrected it). "other" is not a
 * room a buyer can tap to — it is dropped.
 */
export function cleanPlanRooms(value: unknown): PlanRoom[] {
  if (!Array.isArray(value)) return [];
  const byRoom = new Map<PhotoRoom, PlanRoom>();
  for (const item of value.slice(0, 40)) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (!isPhotoRoom(record.room) || record.room === 'other') continue;
    const x = num(record.x);
    const y = num(record.y);
    const w = num(record.w);
    const h = num(record.h);
    if ([x, y, w, h].some(Number.isNaN)) continue;
    if (x < 0 || y < 0 || w < PLAN_ROOM_MIN || h < PLAN_ROOM_MIN) continue;
    if (x + w > 100.01 || y + h > 100.01) continue;
    byRoom.delete(record.room);
    byRoom.set(record.room, { room: record.room, x: round(x), y: round(y), w: round(w), h: round(h) });
  }
  return [...byRoom.values()].slice(0, PLAN_ROOMS_MAX);
}

/** A spin needs enough frames to read as turning; fewer is omitted. */
export const SPIN_MIN = 12;
export const SPIN_MAX = 36;

export function spinFrames<T>(frames: readonly T[] | undefined): T[] {
  if (!frames || frames.length < SPIN_MIN) return [];
  return frames.slice(0, SPIN_MAX);
}

/**
 * A depth map is only good for the photograph it was computed from. The
 * worker records both; a map for a cover that has since been replaced is
 * refused rather than drawn under the wrong picture.
 */
export const VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9'] as const;
export type StoredVideoCodec = (typeof VIDEO_CODECS)[number];

export interface ListingVideo {
  url: string;
  posterUrl?: string;
  width: number;
  height: number;
  seconds: number;
  codec: StoredVideoCodec;
}

/**
 * A video the page may play. Wrong host, wrong folder, a missing bound, or
 * an unnamed codec means no video — the same drop as a depth map for the
 * wrong cover. The file has to live under this listing's `browser/` prefix,
 * which is the only place the agent's browser may write.
 */
export function cleanVideo(value: unknown, listingId: string): ListingVideo | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== 'string' || !record.url.startsWith('https://')) return undefined;
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return undefined;
  }
  if (!url.pathname.includes(`/${listingId}/browser/`)) return undefined;
  const width = num(record.width);
  const height = num(record.height);
  const seconds = num(record.seconds);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4000 || height > 4000) {
    return undefined;
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) return undefined;
  if (typeof record.codec !== 'string' || !(VIDEO_CODECS as readonly string[]).includes(record.codec)) return undefined;
  const poster = typeof record.posterUrl === 'string' && record.posterUrl.startsWith('https://') ? record.posterUrl : undefined;
  return {
    url: record.url,
    width,
    height,
    seconds: Math.round(seconds),
    codec: record.codec as StoredVideoCodec,
    ...(poster ? { posterUrl: poster } : {}),
  };
}

export function depthFor(depth: unknown, coverUrl: string): string | undefined {
  if (typeof depth !== 'object' || depth === null) return undefined;
  const record = depth as Record<string, unknown>;
  if (typeof record.url !== 'string' || typeof record.cover !== 'string') return undefined;
  if (record.cover !== coverUrl) return undefined;
  return record.url.startsWith('https://') || record.url.startsWith('/') ? record.url : undefined;
}
