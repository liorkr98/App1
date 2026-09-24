/**
 * Public parking from the Survey of Israel layer on data.gov.il.
 *
 * Resource `34729a10-299b-448d-a223-5d7533e8f147`, measured 15 September 2026:
 * 5,826 rows. Coordinates are ITM metres in `X` / `Y` (and `E_ORD` / `N_ORD`),
 * not lat/long. Transformation is `upsert_civic_itm` in Postgres (EPSG:2039 →
 * 4326). This file never invents a WGS84 point.
 *
 * NEVER queried at page render. Walking minutes are still OSRM at publish.
 */

import { upsertCivicItm, type CivicItmWrite } from '../civic-itm.js';
import { streamResource } from '../ckan.js';
import { runSync, type SyncResult } from '../sync.js';

export const PARKING_RESOURCE = '34729a10-299b-448d-a223-5d7533e8f147';

export interface ParkingRow {
  _id: number;
  UNIQ_ID?: string | number | null;
  NAME?: string | null;
  SETL_NAME?: string | null;
  X?: string | number | null;
  Y?: string | number | null;
}

/**
 * Rough ITM envelope for Israel. Outliers are dropped before PostGIS so a
 * swapped lat/long cannot become a "successful" transform into the sea.
 */
export function plausibleItm(x: number, y: number): boolean {
  return x > 130_000 && x < 280_000 && y > 370_000 && y < 800_000;
}

export function parkingToItm(row: ParkingRow): CivicItmWrite | undefined {
  const id = String(row.UNIQ_ID ?? '').trim();
  if (!id) return undefined;

  const place = String(row.NAME ?? '').trim();
  const town = String(row.SETL_NAME ?? '').trim();
  const name = [place, town].filter(Boolean).join(', ');
  if (!name) return undefined;

  const x = Number(row.X);
  const y = Number(row.Y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !plausibleItm(x, y)) return undefined;

  return { site_id: `parking-${id}`, name, kind: 'parking', x, y };
}

export async function syncParking(): Promise<SyncResult> {
  return runSync('parking', async () => {
    const skipped: Record<string, number> = {
      no_id: 0,
      unnamed: 0,
      bad_itm: 0,
    };

    const rows: CivicItmWrite[] = [];
    const seen = new Set<string>();

    for await (const batch of streamResource<ParkingRow>(PARKING_RESOURCE, {
      fields: ['_id', 'UNIQ_ID', 'NAME', 'SETL_NAME', 'X', 'Y'],
    })) {
      for (const row of batch) {
        const site = parkingToItm(row);
        if (!site) {
          if (!String(row.UNIQ_ID ?? '').trim()) {
            skipped.no_id = (skipped.no_id ?? 0) + 1;
          } else if (!String(row.NAME ?? '').trim() && !String(row.SETL_NAME ?? '').trim()) {
            skipped.unnamed = (skipped.unnamed ?? 0) + 1;
          } else {
            skipped.bad_itm = (skipped.bad_itm ?? 0) + 1;
          }
          continue;
        }
        if (seen.has(site.site_id)) continue;
        seen.add(site.site_id);
        rows.push(site);
      }
    }

    const written = await upsertCivicItm(rows);
    return { rows: written, skipped };
  });
}
