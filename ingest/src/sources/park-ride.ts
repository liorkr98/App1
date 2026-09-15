/**
 * Park-and-ride lots from the Ministry of Transport on data.gov.il.
 *
 * Resource `e1666064-8b58-41ec-b770-c909a5075134`, measured 15 September 2026:
 * 186 rows. Coordinates are ITM metres in `X` / `Y`. Same PostGIS transform
 * as public parking. Only lots marked `קיים` are written — a planned lot is
 * not a walking time a buyer can use.
 *
 * NEVER queried at page render.
 */

import { upsertCivicItm, type CivicItmWrite } from '../civic-itm.js';
import { streamResource } from '../ckan.js';
import { runSync, type SyncResult } from '../sync.js';

import { plausibleItm } from './parking.js';

export const PARK_RIDE_RESOURCE = 'e1666064-8b58-41ec-b770-c909a5075134';

export interface ParkRideRow {
  _id: number;
  ID?: number | string | null;
  NAME?: string | null;
  STATUS?: string | null;
  X?: number | string | null;
  Y?: number | string | null;
}

function asId(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export function parkRideToItm(row: ParkRideRow): CivicItmWrite | undefined {
  if (String(row.STATUS ?? '').trim() !== 'קיים') return undefined;

  const id = asId(row.ID);
  const name = String(row.NAME ?? '').trim();
  if (!id || !name) return undefined;

  const x = Number(row.X);
  const y = Number(row.Y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !plausibleItm(x, y)) return undefined;

  return { site_id: `parkride-${id}`, name, kind: 'park_ride', x, y };
}

export async function syncParkRide(): Promise<SyncResult> {
  return runSync('park_ride', async () => {
    const skipped: Record<string, number> = {
      not_open: 0,
      no_id: 0,
      unnamed: 0,
      bad_itm: 0,
    };

    const rows: CivicItmWrite[] = [];
    const seen = new Set<string>();

    for await (const batch of streamResource<ParkRideRow>(PARK_RIDE_RESOURCE, {
      fields: ['_id', 'ID', 'NAME', 'STATUS', 'X', 'Y'],
    })) {
      for (const row of batch) {
        const site = parkRideToItm(row);
        if (!site) {
          if (String(row.STATUS ?? '').trim() !== 'קיים') {
            skipped.not_open = (skipped.not_open ?? 0) + 1;
          } else if (!asId(row.ID)) {
            skipped.no_id = (skipped.no_id ?? 0) + 1;
          } else if (!String(row.NAME ?? '').trim()) {
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
