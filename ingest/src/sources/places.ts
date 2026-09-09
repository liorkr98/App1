import { isHebrew, toCategory, toName } from '../osm/categories.js';
import { streamFeatures, withPlaceFeatures } from '../osm/extract.js';
import { runSync, upsertBatches, type SyncResult } from '../sync.js';

/**
 * Food, culture, parks, groceries, pharmacies and gyms, from OpenStreetMap.
 *
 * ODbL. Attribution is a licence condition and it is already seeded into
 * source_sync (0007), from where it travels into the enrichment payload —
 * so a page that renders places cannot render them without the credit
 * (CLAUDE.md §10).
 *
 * NOTHING HERE HAS RUN. The Israel extract is a few hundred megabytes and the
 * development machine can neither download it nor run osmium. See
 * docs/DATA-SOURCES.md.
 */

/** Israel's bounding box, generously drawn. Outside it is a bad row. */
function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

export async function syncPlaces(): Promise<SyncResult> {
  return runSync('places', async () => {
    const skipped: Record<string, number> = {
      unnamed: 0,
      uncategorised: 0,
      no_point: 0,
      outside_israel: 0,
      malformed: 0,
    };

    // Reported rather than filtered on. A places list that is mostly Latin is
    // a coverage problem worth seeing, not a rendering one — and it would be
    // invisible from the row count alone.
    let latinOnly = 0;

    return withPlaceFeatures(async (features) => {
      const parseStats = { malformed: 0 };
      const rows: Record<string, unknown>[] = [];
      const seen = new Set<string>();

      for await (const feature of streamFeatures(features, parseStats)) {
        const tags = feature.properties ?? {};

        // osmium writes the element's identity into @id and @type, which is
        // what makes re-import idempotent: node/240109189 is stable across
        // extracts in a way a generated key would not be.
        const osmType = tags['@type'];
        const osmId = tags['@id'];
        const id = osmType && osmId ? `${osmType}/${osmId}` : undefined;
        if (!id || seen.has(id)) continue;

        const category = toCategory(tags);
        if (!category) {
          // Should be impossible — pass one filtered on exactly these tags —
          // so a non-zero count here means the filter and the mapping have
          // drifted apart.
          skipped.uncategorised = (skipped.uncategorised ?? 0) + 1;
          continue;
        }

        const name = toName(tags);
        if (!name) {
          // A park with no name is a green rectangle we cannot write a
          // sentence about. §7 forbids a placeholder, so it is omitted.
          skipped.unnamed = (skipped.unnamed ?? 0) + 1;
          continue;
        }
        if (!isHebrew(name)) latinOnly += 1;

        const point = feature.geometry;
        if (point?.type !== 'Point' || !Array.isArray(point.coordinates)) {
          skipped.no_point = (skipped.no_point ?? 0) + 1;
          continue;
        }

        // GeoJSON is [longitude, latitude] — in that order, by specification.
        // Reading it the other way is the commonest bug in spatial work and
        // it puts Tel Aviv in Iraq.
        const [lon, lat] = point.coordinates;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          skipped.no_point = (skipped.no_point ?? 0) + 1;
          continue;
        }
        if (!withinIsrael(lon, lat)) {
          skipped.outside_israel = (skipped.outside_israel ?? 0) + 1;
          continue;
        }

        seen.add(id);
        rows.push({
          osm_id: id,
          name,
          category,
          geom: `SRID=4326;POINT(${lon} ${lat})`,
        });
      }

      skipped.malformed = parseStats.malformed;
      skipped.latin_name_only = latinOnly;

      const written = await upsertBatches('places', rows, 'osm_id');
      return { rows: written, skipped };
    });
  });
}
