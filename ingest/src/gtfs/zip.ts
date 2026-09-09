import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Reading members out of the GTFS zip.
 *
 * Shells out to the system `unzip` rather than adding a Node zip library. The
 * worker already sets this precedent with ffmpeg (worker/src/video was the
 * same shape before it was deferred), and CLAUDE.md §2 asks for a dependency
 * to be justified — a 300MB archive streamed member by member is exactly what
 * `unzip -p` is for, and it is already in every Debian image.
 *
 * `unzip` must be installed in the container. See ingest/Dockerfile.
 */

export class GtfsUnavailable extends Error {
  constructor(cause: string) {
    super(`GTFS feed unavailable: ${cause}`);
    this.name = 'GtfsUnavailable';
  }
}

/**
 * Streams one member of a zip to stdout.
 *
 * `-p` writes the member to stdout with no extraction to disk, which matters
 * for stop_times.txt: it is hundreds of megabytes and we only ever read it
 * once, forwards.
 *
 * Arguments are passed as an array, so a filename can never become a command.
 */
export function memberStream(archivePath: string, member: string): Readable {
  const child = spawn('unzip', ['-p', archivePath, member], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  child.on('close', (code) => {
    if (code !== 0) {
      // Surfaced on the stream so the consumer's for-await rejects rather than
      // silently seeing a short file — a truncated stop_times would look like
      // a feed with fewer stops, which is indistinguishable from a real one.
      child.stdout.destroy(
        new GtfsUnavailable(`unzip exited ${code} reading ${member}: ${stderr.trim()}`),
      );
    }
  });

  child.on('error', (error) => {
    child.stdout.destroy(
      new GtfsUnavailable(
        `could not run unzip (is it installed in the image?): ${error.message}`,
      ),
    );
  });

  return child.stdout;
}

/**
 * Downloads the feed to a scratch file and hands the path to `body`.
 *
 * To disk, not to memory: the archive is a few hundred megabytes and `unzip`
 * needs to seek within it anyway. The `finally` is not optional — the
 * ingestion machine is long-lived, and a few leaked archives fill it, at which
 * point every later job fails for a reason that looks nothing like the cause.
 */
export async function withFeed<T>(
  url: string,
  body: (archivePath: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'gtfs-'));
  const archivePath = join(directory, 'feed.zip');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'listing-pages-ingest/1.0 (+https://hasivuv.com)' },
      // Generous: the feed is large and the ministry's server is not fast.
      signal: AbortSignal.timeout(15 * 60_000),
    });

    if (!response.ok || !response.body) {
      throw new GtfsUnavailable(`HTTP ${response.status} fetching the feed`);
    }

    await pipeline(response.body as unknown as Readable, createWriteStream(archivePath));

    return await body(archivePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
