/**
 * Every row of a select, not the first thousand (13 Oct 2026).
 *
 * PostgREST answers at most 1000 rows a request and says nothing about the
 * rest. The dashboard read listing_event_daily — one row per listing per day
 * over 30 days — in one request, so an agent with 34 live listings saw part
 * of their numbers and no error. This asks page after page until a short one.
 */
export const PAGE_ROWS = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/** `page(from, to)` returns rows from..to inclusive, as PostgREST's .range(). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  size = PAGE_ROWS,
  maxPages = 200,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let index = 0; index < maxPages; index += 1) {
    const from = index * size;
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: null, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < size) return { data: rows, error: null };
  }
  return { data: rows, error: null };
}
