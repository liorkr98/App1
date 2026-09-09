import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { tagFilterExpressions } from './categories.js';

/**
 * Turning the Israel OSM extract into a stream of tagged points.
 *
 * Shells out to `osmium`, the standard OSM command-line tool, for the same
 * reason `unzip` handles the GTFS archive: a `.osm.pbf` is a protobuf format
 * whose Node parsers are all heavier and less maintained than a Debian package
 * that already does it well (CLAUDE.md §2). `osmium-tool` is in the image.
 *
 * Two passes, and the order is the whole point:
 *
 *   1. `tags-filter` reduces a few hundred megabytes of everything to the
 *      handful of tags we display. Done FIRST, so pass two never sees a power
 *      line or a field boundary.
 *   2. `export` emits GeoJSON Text Sequence — one feature per line — which
 *      streams with no JSON parser holding the whole file.
 *
 * Doing it the other way round means exporting all of OSM to GeoJSON and
 * filtering in Node, which is minutes of CPU and gigabytes of garbage for the
 * same answer.
 */

export class OsmUnavailable extends Error {
  constructor(cause: string) {
    super(`OSM extract unavailable: ${cause}`);
    this.name = 'OsmUnavailable';
  }
}

/** Geofabrik's Israel and Palestine extract, refreshed daily upstream. */
export const ISRAEL_EXTRACT_URL =
  'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf';

function run(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) =>
      reject(
        new OsmUnavailable(
          `could not run ${command} (is osmium-tool in the image?): ${error.message}`,
        ),
      ),
    );

    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new OsmUnavailable(`${label} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

/**
 * Downloads the extract, filters and exports it, and hands back a line stream.
 *
 * `-n` on the export makes osmium emit a POINT for ways and relations too,
 * using their centroid. A park is a polygon in OSM; for "how far is the
 * nearest park" its centre is the honest answer and a polygon would be a much
 * larger table for no extra page.
 */
export async function withPlaceFeatures<T>(
  body: (features: Readable) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'osm-'));
  const raw = join(directory, 'israel.osm.pbf');
  const filtered = join(directory, 'places.osm.pbf');
  const geojson = join(directory, 'places.geojsonseq');

  try {
    const response = await fetch(ISRAEL_EXTRACT_URL, {
      headers: { 'User-Agent': 'listing-pages-ingest/1.0 (+https://hasivuv.com)' },
      signal: AbortSignal.timeout(30 * 60_000),
    });

    if (!response.ok || !response.body) {
      throw new OsmUnavailable(`HTTP ${response.status} fetching the extract`);
    }

    await pipeline(response.body as unknown as Readable, createWriteStream(raw));

    // Pass 1 — everything we do not display disappears here.
    await run(
      'osmium',
      ['tags-filter', raw, ...tagFilterExpressions(), '-o', filtered, '--overwrite'],
      'osmium tags-filter',
    );

    // Pass 2 — one GeoJSON feature per line.
    await run(
      'osmium',
      ['export', filtered, '-f', 'geojsonseq', '-n', '-o', geojson, '--overwrite'],
      'osmium export',
    );

    return await body(createReadStream(geojson));
  } finally {
    // Not optional: three files totalling well over a gigabyte, on a
    // long-lived machine. A couple of leaked runs and every later job fails
    // for a reason that looks nothing like a full disk.
    await rm(directory, { recursive: true, force: true });
  }
}

export interface OsmFeature {
  type: string;
  properties?: Record<string, string> & { '@id'?: string; '@type'?: string };
  geometry?: { type: string; coordinates: [number, number] };
}

/**
 * Parses GeoJSON Text Sequence, one feature per line.
 *
 * A malformed line is SKIPPED, not guessed at. osmium does not emit them, but
 * a truncated download would, and half a feature parsed optimistically is a
 * place at the wrong coordinate rather than an error.
 */
export async function* streamFeatures(
  input: Readable,
  stats: { malformed: number },
): AsyncGenerator<OsmFeature> {
  let buffer = '';
  input.setEncoding('utf8');

  const emit = function* (line: string): Generator<OsmFeature> {
    // RFC 7464 permits a leading record separator (U+001E) before each value.
    const trimmed = line.replace(/^\u001e/, '').trim();
    if (!trimmed) return;

    try {
      yield JSON.parse(trimmed) as OsmFeature;
    } catch {
      // Counted, not swallowed. One malformed line is a truncated download;
      // thousands is a format change, and the two must be distinguishable.
      stats.malformed += 1;
    }
  };

  for await (const chunk of input) {
    buffer += chunk as string;

    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      yield* emit(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }

  yield* emit(buffer);
}
