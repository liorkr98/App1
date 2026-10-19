import {
  FILM_FADE_SEC,
  FILM_FPS,
  FILM_MAX,
  FILM_MIN,
  FILM_STILL_SEC,
  filmFit,
  filmFrames,
  filmPose,
  type FilmPose,
} from '@/features/listings/ken-burns';
import {
  FILM_AUDIO_BITS_PER_SECOND,
  FILM_BITS_PER_SECOND,
  pickRecorderType,
  RECORDER_TYPES_WITH_SOUND,
  type RecorderChoice,
} from '@/features/listings/film-format';
import type { FilmMood } from '@/features/listings/film-music';
import {
  FILM_FORMATS,
  endCardAlpha,
  hookAlpha,
  roomCaptionAt,
  storyDuration,
  type FilmFormat,
  type FilmFrame,
} from '@/features/listings/film-overlay';
import { filmMusic } from './film-music';
import type { FilmStory } from './film-story';

/**
 * Encodes the story film in this browser, only when the agent asks: 9:16,
 * 4:5 or 1:1 (FILM_FORMATS), silent unless the agent picked music.
 *
 * The listing page never imports this. If the browser cannot record, the
 * caller keeps the on-page film and uploads nothing.
 *
 * 13 OCT 2026, MADE TO LOOK LIKE A LISTING REEL. Measured on a real
 * recording before this change: the .mp4 was VP9 labelled h264, a 16 s film
 * ran 17.7 s at 20 fps, and the blurred backdrop showed blocks. Now:
 *   - H.264 asked for by name (film-format.ts), the label always the truth;
 *   - every frame painted at the REAL time since the start, so the file is as
 *     long as the film and a slow phone drops frames instead of stretching;
 *   - "fill when it fits" (ken-burns.ts filmFit): a photograph fills the
 *     frame when that loses at most 30% of it, else it is drawn as large as
 *     that allows over its own blurred copy;
 *   - the words of a reel (film-overlay.ts): the place, the title and one
 *     line of facts first, short room names, a closing card with the agent.
 *     Never a house number, a plate or a phone number.
 */

export interface RecordedFilm {
  blob: Blob;
  poster: Blob;
  seconds: number;
  width: number;
  height: number;
  /** The codec the recorder was asked for by name. */
  codec: RecorderChoice['codec'];
  extension: RecorderChoice['extension'];
  mime: string;
  /** Music was asked for and is in the file. */
  music: boolean;
}

export interface FilmOptions {
  format?: FilmFormat;
  /**
   * Music under the film. The context is made by the caller inside the tap
   * (iOS refuses one made later) and closed by the caller.
   */
  music?: { context: AudioContext; mood: FilmMood };
}

const DISPLAY = '"Noto Sans Hebrew", "Heebo", system-ui, sans-serif';
const BODY = '"Heebo", "Assistant", system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = url;
  });
}

/**
 * The backdrop: the photograph filling the frame, blurred and darkened.
 * Canvas `filter` where the browser has it; elsewhere (older Safari) a
 * small copy scaled up in two steps — one step from 1/24 showed blocks.
 */
function backdrop(image: HTMLImageElement, f: FilmFrame): HTMLCanvasElement {
  const full = document.createElement('canvas');
  full.width = f.width;
  full.height = f.height;
  const big = full.getContext('2d');
  if (!big) return full;
  const ratio = image.naturalWidth / image.naturalHeight;
  const cover = (w: number, h: number) => {
    const frame = w / h;
    const dw = ratio > frame ? h * ratio : w;
    const dh = ratio > frame ? h : w / ratio;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  };
  big.imageSmoothingEnabled = true;
  big.imageSmoothingQuality = 'high';
  // Typed as always there; older Safari has no canvas filter at all.
  if (typeof (big as { filter?: unknown }).filter === 'string') {
    const area = cover(f.width, f.height);
    big.filter = 'blur(48px)';
    // Drawn a little larger so the blur has no soft, dark rim.
    big.drawImage(image, area.x - 96, area.y - 96, area.w + 192, area.h + 192);
    big.filter = 'none';
  } else {
    const steps = [24, 6].map((divisor) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(f.width / divisor);
      canvas.height = Math.round(f.height / divisor);
      return canvas;
    });
    const [tiny, mid] = steps as [HTMLCanvasElement, HTMLCanvasElement];
    const tctx = tiny.getContext('2d');
    const mctx = mid.getContext('2d');
    if (!tctx || !mctx) return full;
    const area = cover(tiny.width, tiny.height);
    tctx.drawImage(image, area.x, area.y, area.w, area.h);
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
    big.drawImage(mid, 0, 0, f.width, f.height);
  }
  big.fillStyle = 'rgba(0, 0, 0, 0.32)';
  big.fillRect(0, 0, f.width, f.height);
  return full;
}

function drawStill(ctx: Ctx, f: FilmFrame, image: HTMLImageElement, behind: HTMLCanvasElement, pose: FilmPose): void {
  ctx.drawImage(behind, 0, 0);
  ctx.save();
  ctx.translate(f.width / 2 + pose.shift * f.width, f.height / 2);
  ctx.scale(pose.scale, pose.scale);
  const { width, height } = filmFit(
    { width: image.naturalWidth, height: image.naturalHeight },
    { width: f.width, height: f.height },
  );
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/** One run of text: Hebrew right-to-left, a number left-to-right as its own run (the canvas's <bdi>). */
function run(ctx: Ctx, text: string, edge: number, y: number, isolated: boolean): number {
  ctx.direction = isolated ? 'ltr' : 'rtl';
  ctx.textAlign = isolated ? 'end' : 'start';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, edge, y);
  return ctx.measureText(text).width;
}

/** The words over the opening photographs, from the right-hand safe edge. */
function drawHook(ctx: Ctx, f: FilmFrame, story: FilmStory, alpha: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Down to the words' end on a story; a square's shade stops before its middle.
  const reach = Math.min(1100, Math.round(f.height * 0.62));
  const shade = ctx.createLinearGradient(0, 0, 0, reach);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, f.width, reach);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 12;

  const edge = f.width - f.safe.side;
  let y = f.safe.top + 30;
  if (story.place) {
    ctx.font = `700 36px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    run(ctx, story.place, edge, y, false);
    y += 70;
  }
  ctx.font = `800 78px ${DISPLAY}`;
  ctx.fillStyle = '#ffffff';
  for (const line of story.titleLines.slice(0, 2)) {
    run(ctx, line, edge, y + 30, false);
    y += 92;
  }
  y += 34;
  if (story.facts.length > 0) {
    // Tiles, value over label, as the story image draws them: a fact reads
    // "4 חדרים" but "קומה 5 / 12", so the two are never run into one line.
    let x = edge;
    for (const fact of story.facts) {
      ctx.font = `800 54px ${DISPLAY}`;
      ctx.fillStyle = '#ffffff';
      const valueWidth = ctx.measureText(fact.value).width;
      // Both runs anchored at the same edge: the end of a left-to-right number,
      // the start of a right-to-left word.
      ctx.direction = fact.isolated ? 'ltr' : 'rtl';
      ctx.textAlign = fact.isolated ? 'end' : 'start';
      ctx.textBaseline = 'middle';
      ctx.fillText(fact.value, x, y);
      ctx.font = `600 30px ${BODY}`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      const labelWidth = ctx.measureText(fact.label).width;
      ctx.direction = 'rtl';
      ctx.textAlign = 'start';
      ctx.fillText(fact.label, x, y + 50);
      x -= Math.max(valueWidth, labelWidth) + 56;
    }
    y += 132;
  }
  if (story.price) {
    ctx.font = `800 56px ${DISPLAY}`;
    ctx.fillStyle = '#ffffff';
    run(ctx, story.price, edge, y, true);
  }
  ctx.restore();
}

/** A room's name, centred, low but clear of the apps' caption and buttons. */
function drawRoom(ctx: Ctx, f: FilmFrame, text: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 42px ${BODY}`;
  const width = ctx.measureText(text).width + 64;
  const height = 84;
  const x = (f.width - width) / 2;
  const y = f.height - f.safe.bottom - height;
  ctx.fillStyle = 'rgba(12, 12, 10, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, f.width / 2, y + height / 2 + 2);
  ctx.restore();
}

/** The closing card: the agent's logo and name over the last photograph, blurred. */
function drawEnd(
  ctx: Ctx,
  f: FilmFrame,
  story: FilmStory,
  behind: HTMLCanvasElement,
  logo: HTMLImageElement | undefined,
  alpha: number,
): void {
  if (alpha <= 0 || !story.seller) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(behind, 0, 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.fillRect(0, 0, f.width, f.height);
  let y = f.height / 2 - (logo ? 170 : 40);
  if (logo) {
    const size = 240;
    const scale = Math.min(size / logo.naturalWidth, size / logo.naturalHeight);
    const w = logo.naturalWidth * scale;
    const h = logo.naturalHeight * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(f.width / 2 - size / 2 - 28, y - size / 2 - 28, size + 56, size + 56, 36);
    ctx.fill();
    ctx.drawImage(logo, f.width / 2 - w / 2, y - h / 2, w, h);
    y += size / 2 + 110;
  }
  ctx.fillStyle = '#ffffff';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 68px ${DISPLAY}`;
  ctx.fillText(story.seller.name, f.width / 2, y);
  if (story.seller.role) {
    ctx.font = `400 42px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillText(story.seller.role, f.width / 2, y + 84);
  }
  ctx.restore();
}

interface Scene {
  frame: FilmFrame;
  images: HTMLImageElement[];
  behind: HTMLCanvasElement[];
  story: FilmStory | undefined;
  logo: HTMLImageElement | undefined;
}

function paint(ctx: Ctx, scene: Scene, time: number): void {
  const { frame: f, images, behind, story, logo } = scene;
  const frames = filmFrames(images.length);
  ctx.clearRect(0, 0, f.width, f.height);
  for (const frame of frames) {
    // The last photograph holds still under the closing card instead of vanishing.
    const last = frame.index === frames.length - 1;
    const local = Math.min(time - frame.start, last ? FILM_STILL_SEC : Infinity);
    if (local < 0 || local > FILM_STILL_SEC) continue;
    const image = images[frame.index];
    const back = behind[frame.index];
    if (!image || !back) continue;
    let alpha = 1;
    if (frame.index > 0 && local < FILM_FADE_SEC) alpha = local / FILM_FADE_SEC;
    const tail = FILM_STILL_SEC - local;
    if (!last && tail < FILM_FADE_SEC) alpha = Math.min(alpha, tail / FILM_FADE_SEC);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    drawStill(ctx, f, image, back, filmPose(frame.motion, local / FILM_STILL_SEC));
    ctx.restore();
  }
  if (!story) return;
  drawHook(ctx, f, story, hookAlpha(time));
  const caption = roomCaptionAt(time, story.rooms.slice(0, images.length));
  const room = caption ? story.rooms[caption.index] : undefined;
  if (caption && room) drawRoom(ctx, f, room, caption.alpha);
  const lastBehind = behind[images.length - 1];
  if (lastBehind) drawEnd(ctx, f, story, lastBehind, logo, endCardAlpha(time, images.length));
}

/**
 * Undefined when this browser cannot record, there are fewer than FILM_MIN
 * photographs, or a photograph will not draw. `story` adds the words; the
 * film records without them when it is missing.
 */
export async function recordFilm(
  urls: readonly string[],
  story?: FilmStory,
  options: FilmOptions = {},
): Promise<RecordedFilm | undefined> {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const supported = (mime: string) => MediaRecorder.isTypeSupported(mime);
  const withSound = options.music ? pickRecorderType(supported, RECORDER_TYPES_WITH_SOUND) : undefined;
  const chosen = withSound ?? pickRecorderType(supported);
  if (!chosen || urls.length < FILM_MIN) return undefined;
  const frame = FILM_FORMATS[options.format ?? 'story'];
  if (!('captureStream' in HTMLCanvasElement.prototype)) return undefined;

  let images: HTMLImageElement[];
  try {
    images = await Promise.all(urls.slice(0, FILM_MAX).map(loadImage));
  } catch {
    return undefined;
  }
  // A logo that will not load drops out; the name still closes the film.
  const logo = story?.seller?.logoUrl ? await loadImage(story.seller.logoUrl).catch(() => undefined) : undefined;

  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  let scene: Scene;
  try {
    scene = { frame, images, behind: images.map((image) => backdrop(image, frame)), story, logo };
    // The poster is the opening: the cover with its words.
    paint(ctx, scene, 1.2);
  } catch {
    return undefined;
  }

  const poster = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', 0.82);
  });
  if (!poster) return undefined;
  paint(ctx, scene, 0);

  const total = storyDuration(images.length, Boolean(story?.seller));
  const stream = canvas.captureStream(FILM_FPS);
  const music = withSound && options.music ? filmMusic(options.music.context, options.music.mood, total) : undefined;
  if (music) stream.addTrack(music.track);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: chosen.mime,
      videoBitsPerSecond: FILM_BITS_PER_SECOND,
      ...(music ? { audioBitsPerSecond: FILM_AUDIO_BITS_PER_SECOND } : {}),
    });
  } catch {
    music?.stop();
    return undefined;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: chosen.mime }));
  });

  recorder.start();
  music?.start();
  const start = performance.now();
  // The real clock, not a frame count: the file lasts as long as the film.
  for (;;) {
    const time = (performance.now() - start) / 1000;
    paint(ctx, scene, Math.min(time, total));
    if (time >= total) break;
    await new Promise((resolve) => setTimeout(resolve, 1000 / FILM_FPS));
  }
  recorder.stop();
  const blob = await stopped;
  music?.stop();
  if (blob.size === 0) return undefined;

  return {
    blob,
    poster,
    seconds: Math.max(1, Math.round(total)),
    width: frame.width,
    height: frame.height,
    codec: chosen.codec,
    extension: chosen.extension,
    mime: chosen.mime,
    music: Boolean(music),
  };
}
