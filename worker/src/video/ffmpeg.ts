import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { JobFailure } from '../types.js';

const run = promisify(execFile);

/**
 * The thin ffmpeg wrapper.
 *
 * Kept to two operations — read the duration, grab one frame at a timestamp —
 * because everything clever about D3 is the angular resampling in angles.ts,
 * and that is pure arithmetic that can be tested. This file is the part that
 * cannot be tested without a real video, so it is kept as small as possible.
 *
 * ffprobe and ffmpeg come from the image (see worker/Dockerfile). Arguments
 * are always passed as an array: execFile never goes through a shell, so a
 * filename cannot become a command.
 */

/** Nothing here should take minutes. A hang is a failure, not a slow day. */
const TIMEOUT_MS = 60_000;

export async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      { timeout: TIMEOUT_MS },
    );

    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new JobFailure('video_unreadable', false);
    }
    return seconds;
  } catch (error) {
    if (error instanceof JobFailure) throw error;
    throw new JobFailure('video_unreadable', false);
  }
}

/**
 * Extracts a single frame at `seconds`.
 *
 * -ss goes BEFORE -i on purpose. There it is an input seek: ffmpeg jumps to
 * the nearest keyframe and decodes forward, which is fast enough to run 36
 * times. After -i it would decode the whole file up to that point every time,
 * turning a ten-second job into several minutes.
 *
 * The accuracy cost is real but bounded — modern phone video keyframes every
 * one to two seconds and ffmpeg still decodes forward to the exact timestamp,
 * so the frame is the right one.
 */
export async function extractFrame(file: string, seconds: number, into: string): Promise<Buffer> {
  try {
    await run(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', seconds.toFixed(3),
        '-i', file,
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        into,
      ],
      { timeout: TIMEOUT_MS },
    );
  } catch {
    throw new JobFailure('frame_extraction_failed', true);
  }

  return readFile(into);
}

/**
 * Runs `body` with the video written to a scratch directory, then removes it.
 *
 * ffmpeg needs a seekable file, so the download has to hit disk. The finally
 * is not optional: the pdf and worker machines are long-lived, and a walk-
 * around video is 50-150MB. A few leaked temp files fill the machine and every
 * subsequent job fails with something that looks nothing like the cause.
 */
export async function withTempVideo<T>(
  video: Buffer,
  body: (path: string, directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'spin-'));
  const path = join(directory, 'source');

  try {
    await writeFile(path, video);
    return await body(path, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
