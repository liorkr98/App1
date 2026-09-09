import { db } from './db.js';

/**
 * Sync bookkeeping, and the one rule that matters most in this file:
 *
 *   A FAILED SYNC MUST NEVER EMPTY A TABLE.
 *
 * The obvious implementation of "replace everything" is DELETE then INSERT.
 * Do that, and the day data.gov.il returns an empty result set — a WAF block,
 * a schema change, a bad deploy on their side — every listing page silently
 * loses its schools. Nobody notices, because a missing enrichment block is
 * indistinguishable from a rural address with no schools nearby. That is the
 * failure this module exists to prevent.
 *
 * So: upsert by natural key, never truncate, and only advance the date the
 * page cites when a run actually succeeded.
 */

export interface SyncResult {
  rows: number;
  /** Rows that were skipped, with why. Reported, not swallowed. */
  skipped: Record<string, number>;
}

/**
 * Below this fraction of the previous row count, a sync is treated as broken
 * rather than as a shrinking dataset.
 *
 * Schools close and bus stops move, but not by 40% in a week. A collapse that
 * large is our bug or their outage, and either way the right response is to
 * keep yesterday's data and shout.
 */
const COLLAPSE_THRESHOLD = 0.6;

export class SyncCollapsed extends Error {
  constructor(
    readonly source: string,
    readonly got: number,
    readonly previous: number,
  ) {
    super(
      `${source}: ${got} rows against a previous ${previous} — refusing to publish a collapse`,
    );
    this.name = 'SyncCollapsed';
  }
}

async function previousRowCount(source: string): Promise<number> {
  const { data } = await db().from('source_sync').select('row_count').eq('source', source).single();
  return data?.row_count ?? 0;
}

/**
 * Runs one source's sync with the bookkeeping around it.
 *
 * `last_attempted_at` moves on every run; `last_synced_at` only on success.
 * The page cites the latter, so a week of failures shows the reader a
 * week-old date rather than today's — which is the honest outcome, and the one
 * that makes staleness visible instead of implied.
 */
export async function runSync(
  source: string,
  body: () => Promise<SyncResult>,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  await db().from('source_sync').update({ last_attempted_at: startedAt }).eq('source', source);

  const previous = await previousRowCount(source);

  try {
    const result = await body();

    if (previous > 0 && result.rows < previous * COLLAPSE_THRESHOLD) {
      throw new SyncCollapsed(source, result.rows, previous);
    }

    await db()
      .from('source_sync')
      .update({
        last_synced_at: new Date().toISOString(),
        row_count: result.rows,
        last_error: null,
      })
      .eq('source', source);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';

    // last_synced_at is deliberately NOT touched. The rows already in the
    // table stay exactly as they were, and the page keeps citing the date
    // they were actually current.
    await db().from('source_sync').update({ last_error: message }).eq('source', source);

    throw error;
  }
}

/**
 * Upserts in batches on the table's natural key.
 *
 * Batched because a single 28,000-row request is a timeout, and upserted
 * rather than inserted because re-running a sync must not duplicate anything
 * (C7). The natural keys — סמל מוסד, GTFS stop_id, OSM id — are stable across
 * runs, which is what makes that possible at all.
 *
 * Rows that have DISAPPEARED from the source are left in place. A school that
 * closed is a rounding error on a page; a table emptied by a bad response is
 * not. Removing stale rows is a separate, deliberate operation.
 */
export async function upsertBatches<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflictKey: string,
  batchSize = 500,
): Promise<number> {
  let written = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    // supabase-js types upsert against a GENERATED Database schema, and
    // ingest has none: these tables are defined by 0007 and validated by
    // Postgres, not by TypeScript. The cast is where that is admitted out
    // loud rather than papered over with a fake generated type.
    const { error } = await db()
      .from(table)
      .upsert(batch as never, { onConflict: conflictKey });

    if (error) {
      throw new Error(`${table}: upsert failed at row ${start}: ${error.message}`);
    }
    written += batch.length;
  }

  return written;
}
