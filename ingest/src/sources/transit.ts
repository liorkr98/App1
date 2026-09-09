import { streamCsv } from '../gtfs/csv.js';
import { dominantMode, toMode, type TransitMode } from '../gtfs/mode.js';
import { memberStream, withFeed } from '../gtfs/zip.js';
import { runSync, upsertBatches, type SyncResult } from '../sync.js';

/**
 * Transit stops, from the Ministry of Transport GTFS feed.
 *
 * We ingest only what the page consumes: a stop, the routes serving it, and
 * the mode. Everything else in the feed — calendars, shapes, fares, transfers
 * — is discarded, because the page never answers "when is the next one".
 *
 * NOTHING HERE HAS RUN. The feed could not be downloaded from the development
 * machine, so the field names below come from the GTFS specification rather
 * than from the Israeli export, and the light-rail encoding is unconfirmed.
 * See docs/DATA-SOURCES.md. The first real sync will either work or throw with
 * the exact unmapped value, which is why mode.ts throws instead of defaulting.
 */

const FEED_URL = 'https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip';

/** Israel's bounding box, generously drawn. Outside it is a bad row. */
function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

export async function syncTransit(): Promise<SyncResult> {
  return runSync('transit', async () => {
    const skipped: Record<string, number> = {
      no_coordinate: 0,
      outside_israel: 0,
      unserved: 0,
      unknown_route: 0,
    };

    return withFeed(FEED_URL, async (archive) => {
      // --- routes.txt: route_id → designation and mode -------------------
      //
      // Small: a few thousand rows. Read first so an unmapped route_type
      // fails before we have spent twenty minutes streaming stop_times.
      const routes = new Map<string, { name: string; mode: TransitMode }>();

      for await (const row of streamCsv(memberStream(archive, 'routes.txt'))) {
        const id = row.route_id?.trim();
        if (!id) continue;

        // short_name is the designation a person uses — "5", "5א", "הקו האדום".
        // long_name is a description and belongs nowhere near a route chip.
        const name = (row.route_short_name || row.route_long_name || '').trim();
        routes.set(id, { name, mode: toMode(row.route_type ?? '') });
      }

      // --- trips.txt: trip_id → route_id ---------------------------------
      //
      // MEMORY RISK, stated rather than discovered: the Israeli feed has
      // millions of trips, and this map holds one entry per trip. Route ids
      // are interned by reusing the string from `routes`, so only the keys
      // are new allocations — but on a small machine this is still the line
      // that will OOM first. If it does, the fix is to stage the join in
      // Postgres rather than to shrink the map.
      const tripRoute = new Map<string, string>();

      for await (const row of streamCsv(memberStream(archive, 'trips.txt'))) {
        const tripId = row.trip_id?.trim();
        const routeId = row.route_id?.trim();
        if (!tripId || !routeId) continue;
        if (!routes.has(routeId)) continue;
        tripRoute.set(tripId, routeId);
      }

      // --- stop_times.txt: stop_id → the routes serving it ----------------
      //
      // The big one, and the reason the CSV reader streams. Never accumulated:
      // each row is reduced into the set immediately and discarded.
      const stopRoutes = new Map<string, Set<string>>();

      for await (const row of streamCsv(memberStream(archive, 'stop_times.txt'))) {
        const stopId = row.stop_id?.trim();
        const tripId = row.trip_id?.trim();
        if (!stopId || !tripId) continue;

        const routeId = tripRoute.get(tripId);
        if (!routeId) {
          skipped.unknown_route = (skipped.unknown_route ?? 0) + 1;
          continue;
        }

        const set = stopRoutes.get(stopId) ?? new Set<string>();
        set.add(routeId);
        stopRoutes.set(stopId, set);
      }

      // --- stops.txt: the rows we actually write --------------------------
      const rows: Record<string, unknown>[] = [];

      for await (const row of streamCsv(memberStream(archive, 'stops.txt'))) {
        const stopId = row.stop_id?.trim();
        if (!stopId) continue;

        const serving = stopRoutes.get(stopId);
        if (!serving || serving.size === 0) {
          // A stop no route serves is a stop nobody can catch anything from.
          // Israeli feeds carry plenty: decommissioned, seasonal, or parent
          // stations that only exist to group platforms.
          skipped.unserved = (skipped.unserved ?? 0) + 1;
          continue;
        }

        const lat = Number(row.stop_lat);
        const lon = Number(row.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          skipped.no_coordinate = (skipped.no_coordinate ?? 0) + 1;
          continue;
        }
        if (!withinIsrael(lon, lat)) {
          skipped.outside_israel = (skipped.outside_israel ?? 0) + 1;
          continue;
        }

        const served = [...serving].map((id) => routes.get(id)).filter((r) => r !== undefined);

        rows.push({
          stop_id: stopId,
          name: (row.stop_name ?? '').trim(),
          // Longitude first. The commonest transposition bug in spatial work,
          // and it puts Tel Aviv in Iraq.
          geom: `SRID=4326;POINT(${lon} ${lat})`,
          mode: dominantMode(served.map((r) => r.mode)),
          // Deduplicated and sorted so a re-sync produces an identical array
          // and the upsert is genuinely idempotent rather than merely
          // convergent.
          routes: [...new Set(served.map((r) => r.name).filter(Boolean))].sort(),
        });
      }

      const written = await upsertBatches('transit_stops', rows, 'stop_id');
      return { rows: written, skipped };
    });
  });
}
