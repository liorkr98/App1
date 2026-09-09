/**
 * data.gov.il CKAN client.
 *
 * Three things about this API are not obvious and each one costs an afternoon
 * to rediscover, so they are handled here once rather than in every source.
 */

/** Anything past this and CKAN starts refusing rather than paging. */
const PAGE_SIZE = 5_000;

/**
 * Offset paging degrades badly past roughly this many rows, so we switch to
 * seeking on the monotonic `_id` instead.
 *
 * The registry has 4.2 million rows and the ownership history 5.4 million, so
 * this is not a theoretical limit — it is hit on the first full sync.
 */
const OFFSET_CEILING = 32_000;

export class CkanError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when a WAF answered rather than CKAN. */
    readonly blocked: boolean,
  ) {
    super(message);
    this.name = 'CkanError';
  }
}

interface DatastoreResponse<T> {
  success: boolean;
  result?: {
    records: T[];
    total?: number;
    fields?: { id: string; type: string }[];
  };
  error?: { message?: string };
}

/**
 * A WAF sits in front of data.gov.il and answers some requests with
 * `403 Security Violation` instead of passing them to CKAN.
 *
 * We surface that as its own error and let the caller back off. We do NOT
 * disguise the client as a browser to get around it: the block is the
 * operator's decision on their own infrastructure, and quietly defeating it
 * would be both rude and fragile — it would work until they tightened it, and
 * then fail in production rather than here.
 */
function looksBlocked(status: number, body: string): boolean {
  return status === 403 || /security violation/i.test(body);
}

async function call<T>(url: string): Promise<DatastoreResponse<T>> {
  const response = await fetch(url, {
    headers: {
      // Honest identification, with a contact route. This is what a
      // well-behaved scheduled client looks like.
      'User-Agent': 'listing-pages-ingest/1.0 (+https://github.com/liorkr98/App1)',
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (looksBlocked(response.status, text)) {
    throw new CkanError('WAF rejected the request', response.status, true);
  }
  if (!response.ok) {
    throw new CkanError(`HTTP ${response.status}`, response.status, false);
  }

  try {
    return JSON.parse(text) as DatastoreResponse<T>;
  } catch {
    // A 200 that is not JSON is almost always an interstitial page.
    throw new CkanError('response was not JSON', response.status, true);
  }
}

export interface PageOptions {
  /**
   * Server-side filter, e.g. `{ 'שנה': 2026 }`.
   *
   * Hebrew field names and values must be percent-encoded, which
   * URLSearchParams does correctly — the trap is hand-building the query
   * string, where a raw Hebrew key silently produces an empty result set
   * rather than an error.
   */
  filters?: Record<string, string | number>;
  /** Restrict to the columns actually needed. Materially faster on wide tables. */
  fields?: string[];
}

/**
 * Streams an entire datastore resource.
 *
 * Yields batches rather than accumulating: the vehicle registry is 4.2 million
 * rows and holding it in memory is how a 2GB ingestion machine dies.
 */
export async function* streamResource<T extends { _id: number }>(
  resourceId: string,
  options: PageOptions = {},
): AsyncGenerator<T[]> {
  let offset = 0;

  // Phase 1: ordinary offset paging, which is what datastore_search supports.
  for (;;) {
    const params = new URLSearchParams({
      resource_id: resourceId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sort: '_id asc',
    });

    if (options.fields?.length) params.set('fields', options.fields.join(','));
    if (options.filters && Object.keys(options.filters).length > 0) {
      // JSON.stringify then URLSearchParams: the Hebrew keys are
      // percent-encoded correctly by the latter. Hand-building this query
      // string is the classic failure — a raw Hebrew key returns an EMPTY
      // result set rather than an error, so the sync looks like it worked.
      params.set('filters', JSON.stringify(options.filters));
    }

    const body = await call<T>(
      `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`,
    );
    if (!body.success || !body.result) {
      throw new CkanError(body.error?.message ?? 'datastore_search failed', 200, false);
    }

    const records = body.result.records;
    if (records.length === 0) return;
    yield records;

    offset += records.length;
    if (records.length < PAGE_SIZE) return;

    if (offset >= OFFSET_CEILING) {
      const last = records[records.length - 1];
      yield* seekResource<T>(resourceId, last ? last._id : 0, options);
      return;
    }
  }
}

/**
 * Phase 2: cursor paging on `_id`, for the tables too large to offset through.
 *
 * datastore_search has no `_id > n` operator — its `filters` are equality
 * only — so this goes through datastore_search_sql, which does. That endpoint
 * is not enabled on every CKAN instance; if it is disabled the error says so
 * plainly rather than the sync quietly stopping at 32,000 rows, which is the
 * failure that would otherwise look like a successful partial import.
 */
async function* seekResource<T extends { _id: number }>(
  resourceId: string,
  startAfterId: number,
  options: PageOptions,
): AsyncGenerator<T[]> {
  let lastId = startAfterId;

  // Identifiers are quoted; the resource id comes from our own source
  // definitions and never from user input.
  const columns = options.fields?.length
    ? options.fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(', ')
    : '*';

  const equality = Object.entries(options.filters ?? {})
    .map(([key, value]) => {
      const column = `"${key.replace(/"/g, '""')}"`;
      const literal = typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
      return ` AND ${column} = ${literal}`;
    })
    .join('');

  for (;;) {
    const sql =
      `SELECT ${columns} FROM "${resourceId}" ` +
      `WHERE _id > ${lastId}${equality} ORDER BY _id ASC LIMIT ${PAGE_SIZE}`;

    const params = new URLSearchParams({ sql });
    const body = await call<T>(
      `https://data.gov.il/api/3/action/datastore_search_sql?${params.toString()}`,
    );

    if (!body.success || !body.result) {
      throw new CkanError(
        `cursor paging failed past ${OFFSET_CEILING} rows — datastore_search_sql ` +
          `may be disabled for this resource: ${body.error?.message ?? 'unknown'}`,
        200,
        false,
      );
    }

    const records = body.result.records;
    if (records.length === 0) return;
    yield records;

    const last = records[records.length - 1];
    if (!last) return;
    lastId = last._id;

    if (records.length < PAGE_SIZE) return;
  }
}

/** Row count without pulling any rows. Used to sanity-check a sync. */
export async function resourceTotal(resourceId: string): Promise<number> {
  const params = new URLSearchParams({ resource_id: resourceId, limit: '0' });
  const body = await call<never>(
    `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`,
  );
  return body.result?.total ?? 0;
}

/**
 * Runs one aggregate against a resource and returns the single value.
 *
 * Exists so callers can ask the datastore a question — "what is the newest
 * year in this table?" — instead of inferring an answer from whatever the
 * first page happened to contain.
 */
export async function queryScalar(sql: string): Promise<unknown> {
  const params = new URLSearchParams({ sql });
  const body = await call<Record<string, unknown>>(
    `https://data.gov.il/api/3/action/datastore_search_sql?${params.toString()}`,
  );

  if (!body.success || !body.result) {
    throw new CkanError(body.error?.message ?? 'datastore_search_sql failed', 200, false);
  }

  const first = body.result.records[0];
  if (!first) return undefined;
  return Object.values(first)[0];
}
