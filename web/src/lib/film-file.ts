import {
  FILM_FADE_SEC,
  FILM_FPS,
  FILM_MAX,
  FILM_STILL_SEC,
  filmDuration,
  filmFrames,
  filmPose,
  type FilmPose,
} from '@/features/listings/ken-burns';

/**
 * Encodes the silent film in this browser, only when the agent asks.
 *
 * The listing page never imports this. If the browser cannot record, the
 * caller keeps the on-page film and uploads nothing.
 */

export interface RecordedFilm {
  blob: Blob;
  poster: Blob;
  seconds: number;
  width: number;
  height: number;
  /** h264 for an mp4, otherwise the webm codec the recorder actually used. */
  codec: 'h264' | 'vp8' | 'vp9';
  extension: 'mp4' | 'webm';
}

const WIDTH = 1080;
const HEIGHT = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, pose: FilmPose): void {
  ctx.save();
  ctx.translate(WIDTH / 2 + pose.shift * WIDTH, HEIGHT / 2);
  ctx.scale(pose.scale, pose.scale);
  const ratio = image.naturalWidth / image.naturalHeight;
  const frame = WIDTH / HEIGHT;
  const dw = ratio > frame ? HEIGHT * ratio : WIDTH;
  const dh = ratio > frame ? HEIGHT : WIDTH / ratio;
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function paint(
  ctx: CanvasRenderingContext2D,
  images: HTMLImageElement[],
  time: number,
): void {
  const frames = filmFrames(images.length);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  for (const frame of frames) {
    const local = time - frame.start;
    if (local < 0 || local > FILM_STILL_SEC) continue;
    const image = images[frame.index];
    if (!image) continue;
    let alpha = 1;
    if (frame.index > 0 && local < FILM_FADE_SEC) alpha = local / FILM_FADE_SEC;
    const tail = FILM_STILL_SEC - local;
    if (frame.index < frames.length - 1 && tail < FILM_FADE_SEC) alpha = Math.min(alpha, tail / FILM_FADE_SEC);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    drawCover(ctx, image, filmPose(frame.motion, local / FILM_STILL_SEC));
    ctx.restore();
  }
}

function mimeOf(): { mime: string; codec: RecordedFilm['codec']; extension: RecordedFilm['extension'] } | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (MediaRecorder.isTypeSupported('video/mp4')) return { mime: 'video/mp4', codec: 'h264', extension: 'mp4' };
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    return { mime: 'video/webm;codecs=vp9', codec: 'vp9', extension: 'webm' };
  }
  if (MediaRecorder.isTypeSupported('video/webm')) return { mime: 'video/webm', codec: 'vp8', extension: 'webm' };
  return undefined;
}

/** Undefined when this browser cannot record, or a photograph will not draw. */
export async function recordFilm(urls: readonly string[]): Promise<RecordedFilm | undefined> {
  const chosen = mimeOf();
  if (!chosen || urls.length === 0) return undefined;
  if (!('captureStream' in HTMLCanvasElement.prototype)) return undefined;

  let images: HTMLImageElement[];
  try {
    images = await Promise.all(urls.slice(0, FILM_MAX).map(loadImage));
  } catch {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  try {
    paint(ctx, images, 0);
  } catch {
    return undefined;
  }

  const poster = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', 0.82);
  });
  if (!poster) return undefined;

  const stream = canvas.captureStream(FILM_FPS);
  const recorder = new MediaRecorder(stream, { mimeType: chosen.mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: chosen.mime }));
  });
  recorder.start();

  const total = filmDuration(images.length);
  const step = 1 / FILM_FPS;
  for (let time = 0; time <= total; time += step) {
    paint(ctx, images, Math.min(time, total));
    await new Promise((resolve) => setTimeout(resolve, 1000 / FILM_FPS));
  }
  recorder.stop();
  const blob = await stopped;
  if (blob.size === 0) return undefined;

  return {
    blob,
    poster,
    seconds: Math.max(1, Math.round(total)),
    width: WIDTH,
    height: HEIGHT,
    codec: chosen.codec,
    extension: chosen.extension,
  };
}
