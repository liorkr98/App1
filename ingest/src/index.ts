import { syncSchools } from './sources/schools.js';
import { SyncCollapsed } from './sync.js';

/**
 * Ingestion entry point.
 *
 * One process per source, scheduled separately (C7). Kept apart from the image
 * worker deliberately: a school sync that runs for twenty minutes must not sit
 * in the same queue as a seller waiting for their photos.
 *
 * Exits non-zero on failure so the scheduler alerts rather than recording a
 * quiet success — and, per sync.ts, a failure leaves the previous data exactly
 * where it was.
 */

type SourceName = 'schools' | 'transit' | 'places';

const SOURCES: Record<SourceName, () => Promise<{ rows: number; skipped: Record<string, number> }>> = {
  schools: syncSchools,

  // Not written yet. Named here so `sync transit` fails with a sentence
  // instead of "unknown source", which reads like a typo rather than a
  // deliberately unfinished job.
  transit: () => {
    throw new Error(
      'transit sync is not implemented: the GTFS feed is a zip at gtfs.mot.gov.il ' +
        'and how it encodes light rail has not been verified. See docs/DATA-SOURCES.md.',
    );
  },
  places: () => {
    throw new Error(
      'places sync is not implemented: it needs the Israel OSM extract loaded into ' +
        'PostGIS, which has never been run. See docs/DATA-SOURCES.md.',
    );
  },
};

function log(event: string, fields: Record<string, unknown> = {}): void {
  // Structured, one line. Never a coordinate that identifies a person's home
  // (CLAUDE.md §8).
  console.log(JSON.stringify({ event, ...fields }));
}

async function main(): Promise<void> {
  const requested = process.argv[2];

  if (!requested || !(requested in SOURCES)) {
    log('usage', { sources: Object.keys(SOURCES) });
    process.exit(2);
  }

  const source = requested as SourceName;
  const startedAt = Date.now();

  try {
    const result = await SOURCES[source]();
    log('sync_done', {
      source,
      rows: result.rows,
      // Reported, never swallowed: "28,000 schools ingested" means something
      // different if 9,000 were dropped for a coordinate we did not trust.
      skipped: result.skipped,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    if (error instanceof SyncCollapsed) {
      log('sync_collapsed', {
        source,
        got: error.got,
        previous: error.previous,
        note: 'previous data left in place',
      });
    } else {
      log('sync_failed', {
        source,
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
    process.exit(1);
  }
}

void main();
