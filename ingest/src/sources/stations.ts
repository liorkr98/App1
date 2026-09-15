import { streamResource } from '../ckan.js';
import { runSync, upsertBatches, type SyncResult } from '../sync.js';

/**
 * Bus stations from the Ministry of Transport CKAN table.
 *
 * The GTFS zip (`sources/transit.ts`) is the richer feed — routes per stop —
 * and it has never run from a development machine: the archive is huge and
 * the light-rail encoding is unconfirmed. This table is 34,221 rows with
 * WGS84 lat/long, which is what a first transit ingest can actually finish.
 *
 * Resource `e873e6a2-66c1-494f-a677-f5e77348edb0`, measured 15 September 2026.
 * Stop ids are prefixed `gov-` so a later GTFS upsert on native stop_id does
 * not collide. Bookkeeping writes `source_sync.transit` so the page cites
 * משרד התחבורה.
 *
 * NEVER queried at page render (CLAUDE.md §12). Walking minutes are still
 * OSRM at publish, never straight-line.
 */

export const BUS_STATIONS_RESOURCE = 'e873e6a2-66c1-494f-a677-f5e77348edb0';

export interface StationRow {
  _id: number;
  StationId: number | string;
  CityName?: string | null;
  StationTypeName?: string | null;
  Lat: number | string;
  Long: number | string;
}

export interface TransitStopWrite {
  stop_id: string;
  name: string;
  geom: string;
  mode: 'bus';
  routes: string[];
}

/** Israel's bounding box, generously drawn. Outside it is a bad row. */
export function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

/**
 * One CKAN station → one transit_stops row, or undefined if it cannot be
 * published (no coordinate, outside Israel, no identity).
 *
 * Stations have no stop name in this table — CityName + type only. Inventing
 * a street would be a caption the register did not write.
 */
export function stationToStop(row: StationRow): TransitStopWrite | undefined {
  const id = String(row.StationId ?? '').trim();
  if (!id) return undefined;

  const lat = Number(row.Lat);
  const lon = Number(row.Long);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (!withinIsrael(lon, lat)) return undefined;

  const city = String(row.CityName ?? '').trim();
  const kind = String(row.StationTypeName ?? '').trim();
  const name = [kind || 'תחנת אוטובוס', city].filter(Boolean).join(', ');
  if (!name) return undefined;

  return {
    stop_id: `gov-${id}`,
    name,
    geom: `SRID=4326;POINT(${lon} ${lat})`,
    mode: 'bus',
    routes: [],
  };
}

export async function syncStations(): Promise<SyncResult> {
  return runSync('transit', async () => {
    const skipped: Record<string, number> = {
      no_id: 0,
      no_coordinate: 0,
      outside_israel: 0,
    };

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for await (const batch of streamResource<StationRow>(BUS_STATIONS_RESOURCE, {
      fields: ['StationId', 'CityName', 'StationTypeName', 'Lat', 'Long', '_id'],
    })) {
      for (const row of batch) {
        const stop = stationToStop(row);
        if (!stop) {
          if (!String(row.StationId ?? '').trim()) {
            skipped.no_id = (skipped.no_id ?? 0) + 1;
          } else if (!Number.isFinite(Number(row.Lat)) || !Number.isFinite(Number(row.Long))) {
            skipped.no_coordinate = (skipped.no_coordinate ?? 0) + 1;
          } else {
            skipped.outside_israel = (skipped.outside_israel ?? 0) + 1;
          }
          continue;
        }
        if (seen.has(stop.stop_id)) continue;
        seen.add(stop.stop_id);
        rows.push({ ...stop });
      }
    }

    const written = await upsertBatches('transit_stops', rows, 'stop_id');
    return { rows: written, skipped };
  });
}
