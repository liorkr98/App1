import { db } from './db.js';

/**
 * ITM civic rows. Conversion to WGS84 happens in PostGIS (`upsert_civic_itm`),
 * not here — there is no proj package (CLAUDE.md §2).
 */

export interface CivicItmWrite {
  site_id: string;
  name: string;
  kind: 'parking' | 'park_ride';
  x: number;
  y: number;
}

export async function upsertCivicItm(rows: CivicItmWrite[]): Promise<number> {
  let written = 0;
  const batchSize = 500;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const { data, error } = await db().rpc('upsert_civic_itm', { p_rows: batch });
    if (error) {
      throw new Error(`upsert_civic_itm failed at row ${start}: ${error.message}`);
    }
    written += Number(data ?? 0);
  }

  return written;
}
