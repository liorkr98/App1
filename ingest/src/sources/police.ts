/**
 * Police reception units from data.gov.il.
 *
 * Resource `848b57bf-362f-4eda-993a-3c74b1feef44`, measured 15 September 2026:
 * 213 rows, WGS84 in `Long_X_` / `Lat_Y`. ITM is present (`X_ITM` / `Y_ITM`)
 * and was used only as a gold vector — Beit Dagan HQ 183375/656489 →
 * 34.822599, 32.000961 — so a later ITM ingest can be checked.
 *
 * NEVER queried at page render. Walking minutes are still OSRM at publish.
 */

import { streamResource } from '../ckan.js';
import { runSync, upsertBatches, type SyncResult } from '../sync.js';

export const POLICE_RESOURCE = '848b57bf-362f-4eda-993a-3c74b1feef44';

export interface PoliceRow {
  _id: number;
  UnitName?: string | null;
  SiteType?: string | null;
  Address?: string | null;
  Long_X_?: number | string | null;
  Lat_Y?: number | string | null;
}

export interface CivicSiteWrite {
  site_id: string;
  name: string;
  kind: 'police';
  geom: string;
}

export function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

/**
 * One CKAN desk → one civic_sites row. Name is the unit the register wrote.
 * The street is not invented, and a point outside Israel is dropped.
 */
export function policeToSite(row: PoliceRow): CivicSiteWrite | undefined {
  const name = String(row.UnitName ?? '').trim();
  if (!name) return undefined;

  const lon = Number(row.Long_X_);
  const lat = Number(row.Lat_Y);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  if (!withinIsrael(lon, lat)) return undefined;

  return {
    site_id: `police-${row._id}`,
    name,
    kind: 'police',
    geom: `SRID=4326;POINT(${lon} ${lat})`,
  };
}

export async function syncPolice(): Promise<SyncResult> {
  return runSync('police', async () => {
    const skipped: Record<string, number> = {
      unnamed: 0,
      no_coordinate: 0,
      outside_israel: 0,
    };

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for await (const batch of streamResource<PoliceRow>(POLICE_RESOURCE, {
      fields: ['_id', 'UnitName', 'SiteType', 'Address', 'Long_X_', 'Lat_Y'],
    })) {
      for (const row of batch) {
        const site = policeToSite(row);
        if (!site) {
          if (!String(row.UnitName ?? '').trim()) {
            skipped.unnamed = (skipped.unnamed ?? 0) + 1;
          } else if (!Number.isFinite(Number(row.Long_X_)) || !Number.isFinite(Number(row.Lat_Y))) {
            skipped.no_coordinate = (skipped.no_coordinate ?? 0) + 1;
          } else {
            skipped.outside_israel = (skipped.outside_israel ?? 0) + 1;
          }
          continue;
        }
        if (seen.has(site.site_id)) continue;
        seen.add(site.site_id);
        rows.push({ ...site });
      }
    }

    const written = await upsertBatches('civic_sites', rows, 'site_id');
    return { rows: written, skipped };
  });
}
