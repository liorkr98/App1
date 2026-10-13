import { FILM_FADE_SEC, FILM_STILL_SEC, filmDuration, filmFrames } from './ken-burns.js';

/**
 * When and where the story file's words appear (13 Oct 2026), kept apart
 * from the canvas so the timing can be tested.
 *
 * What listing reels do, and so what this does: a hook on the first frame
 * (the place, the title, one line of facts), short room captions, and a
 * closing card with the agent. Text stays inside the area no app covers:
 * Instagram, TikTok and WhatsApp put the account name at the top and the
 * caption and buttons at the bottom and the right of a 1080 × 1920 frame.
 */
export const FILM_SAFE = { top: 260, bottom: 400, side: 72 } as const;

/** The opening words: in by 0.6 s, out by this. */
export const FILM_HOOK_SEC = 2.8;
/** How long a room's name stays after its photograph arrives. */
export const FILM_ROOM_SEC = 1.6;
/** The closing card. */
export const FILM_END_SEC = 3;

const RAMP = 0.4;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** 0 → 1 → 0 across [from, to], ramping over RAMP at each end. */
function window(time: number, from: number, to: number): number {
  if (time < from || time > to) return 0;
  return clamp(Math.min((time - from) / RAMP, (to - time) / RAMP));
}

export function hookAlpha(time: number): number {
  return window(time, 0.2, FILM_HOOK_SEC);
}

/**
 * The room caption showing at `time`, if any: the photograph's room, from
 * just after it starts to arrive and gone before the next one fades in. A
 * caption is never moved to make room for the hook — the first photograph's
 * name, held back, landed on the kitchen (13 Oct) — it is simply dropped.
 */
export function roomCaptionAt(
  time: number,
  rooms: readonly (string | undefined)[],
): { index: number; alpha: number } | undefined {
  for (const frame of filmFrames(rooms.length)) {
    const room = rooms[frame.index];
    if (!room) continue;
    const from = frame.start + FILM_FADE_SEC / 2;
    if (from < FILM_HOOK_SEC) continue;
    const to = Math.min(from + FILM_ROOM_SEC, frame.start + FILM_STILL_SEC - FILM_FADE_SEC);
    const alpha = window(time, from, to);
    if (alpha > 0) return { index: frame.index, alpha };
  }
  return undefined;
}

/** The closing card fades in over the last photograph's final fade. */
export function endCardStart(count: number): number {
  return Math.max(0, filmDuration(count) - FILM_FADE_SEC);
}

export function endCardAlpha(time: number, count: number): number {
  return clamp((time - endCardStart(count)) / FILM_FADE_SEC);
}

/** The whole file: the film, then the closing card when there is one. */
export function storyDuration(count: number, closing: boolean): number {
  const film = filmDuration(count);
  if (film === 0) return 0;
  return closing ? endCardStart(count) + FILM_END_SEC : film;
}
