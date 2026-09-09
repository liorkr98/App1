import { queryScalar, streamResource } from '../ckan.js';
import { runSync, upsertBatches, type SyncResult } from '../sync.js';

/**
 * Schools and kindergartens, from two data.gov.il datasets.
 *
 * Everything awkward about this source was measured, not assumed — see
 * docs/DATA-SOURCES.md. Three things matter:
 *
 * 1. The institutions table has NO ADDRESS. Locality and authority only. That
 *    is fine, because coordinates come from a companion dataset — schools
 *    never need geocoding.
 *
 * 2. The coordinate columns are MISNAMED. `UTM_X` / `UTM_Y` hold WGS84
 *    longitude and latitude (35.09 / 32.74), not UTM. Real ITM is in the
 *    adjacent ITM_ columns. Treat them as UTM and every school lands in the
 *    sea, silently.
 *
 * 3. The institutions table is a PER-YEAR SNAPSHOT keyed by שנה. Join it
 *    without filtering to the latest year and every school appears once per
 *    year it has existed — 119,761 rows for roughly 28,000 institutions.
 */

const INSTITUTIONS = '5548fd63-5868-4053-ad81-98caddc5e232';
const COORDINATES = '5c5d6bb0-755d-470d-84b6-d7dd3135ba9c';

/**
 * Coordinate precision we are willing to publish a walking time from.
 *
 * The register grades its own geocoding in `RAMAT_DIYUK_MIKUM`. Saying "four
 * minutes' walk" from a point the state itself calls בינונית is precision we
 * do not have, and on a page whose entire proposition is verified data it is
 * exactly the wrong corner to cut.
 */
const ACCEPTED_ACCURACY = new Set(['גבוהה מאוד', 'גבוהה']);

interface InstitutionRow {
  _id: number;
  'סמל מוסד': string | number;
  'שם מוסד': string;
  'שנה': string | number;
  'סוג מוסד'?: string;
  'פיקוח'?: string;
  'משכבה'?: string;
  'עד שכבה'?: string;
  'שם ישוב'?: string;
}

interface CoordinateRow {
  _id: number;
  SEMEL_MOSAD: string | number;
  UTM_X: string | number;
  UTM_Y: string | number;
  RAMAT_DIYUK_MIKUM?: string;
}

const key = (value: string | number): string => String(value).trim();

/** Israel's bounding box, generously drawn. A coordinate outside it is a bug. */
function withinIsrael(lon: number, lat: number): boolean {
  return lon > 34.2 && lon < 35.9 && lat > 29.4 && lat < 33.4;
}

export async function syncSchools(): Promise<SyncResult> {
  return runSync('schools', async () => {
    const skipped: Record<string, number> = {
      no_coordinate: 0,
      low_accuracy: 0,
      outside_israel: 0,
      unnamed: 0,
    };

    // --- Coordinates first. It is the smaller table (28,312 rows) and it is
    // what decides which institutions we can use at all.
    const points = new Map<string, { lon: number; lat: number; accuracy: string }>();

    for await (const batch of streamResource<CoordinateRow>(COORDINATES)) {
      for (const row of batch) {
        // Named UTM, actually WGS84. See the header.
        const lon = Number(row.UTM_X);
        const lat = Number(row.UTM_Y);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (!withinIsrael(lon, lat)) {
          skipped.outside_israel = (skipped.outside_israel ?? 0) + 1;
          continue;
        }
        points.set(key(row.SEMEL_MOSAD), {
          lon,
          lat,
          accuracy: row.RAMAT_DIYUK_MIKUM ?? '',
        });
      }
    }

    // --- Institutions, latest year only.
    //
    // The latest year is discovered rather than hardcoded: a hardcoded 2026
    // returns zero rows in January 2027, and a sync that returns zero rows is
    // the exact failure sync.ts exists to catch — better not to cause it.
    const latestYear = await findLatestYear();

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for await (const batch of streamResource<InstitutionRow>(INSTITUTIONS, {
      filters: { 'שנה': latestYear },
    })) {
      for (const row of batch) {
        const semel = key(row['סמל מוסד']);
        // The year filter should make duplicates impossible; this guards the
        // case where it silently did not apply.
        if (seen.has(semel)) continue;

        const name = String(row['שם מוסד'] ?? '').trim();
        if (!name) {
          skipped.unnamed = (skipped.unnamed ?? 0) + 1;
          continue;
        }

        const point = points.get(semel);
        if (!point) {
          skipped.no_coordinate = (skipped.no_coordinate ?? 0) + 1;
          continue;
        }
        if (!ACCEPTED_ACCURACY.has(point.accuracy)) {
          skipped.low_accuracy = (skipped.low_accuracy ?? 0) + 1;
          continue;
        }

        seen.add(semel);
        rows.push({
          semel_mosad: semel,
          name,
          type: row['סוג מוסד'] ?? null,
          // פיקוח is the supervision stream — ממלכתי, ממלכתי־דתי, חרדי.
          stream: row['פיקוח'] ?? null,
          grade_from: row['משכבה'] ?? null,
          grade_to: row['עד שכבה'] ?? null,
          locality: row['שם ישוב'] ?? null,
          // PostGIS geography literal. Longitude first — the commonest
          // transposition bug in spatial work, and it puts Tel Aviv in Iraq.
          geom: `SRID=4326;POINT(${point.lon} ${point.lat})`,
          location_accuracy: point.accuracy,
        });
      }
    }

    const written = await upsertBatches('schools', rows, 'semel_mosad');
    return { rows: written, skipped };
  });
}

/**
 * Reads the most recent שנה present, rather than assuming one.
 *
 * A hardcoded year returns zero rows the moment the register rolls over, and
 * a sync returning zero rows is exactly the failure sync.ts exists to catch —
 * better not to cause it in the first place.
 *
 * Asked as an aggregate rather than inferred from the first page: the table is
 * not ordered by year, so scanning one page and taking its maximum would be a
 * guess that happens to be right most of the time. Those are the worst kind.
 */
async function findLatestYear(): Promise<number> {
  const value = await queryScalar(
    `SELECT MAX("שנה") AS latest FROM "${INSTITUTIONS}"`,
  );

  const year = Number(value);
  if (!Number.isFinite(year) || year < 2000) {
    throw new Error(
      `schools: could not determine the latest שנה in the institutions table (got ${String(value)})`,
    );
  }

  return year;
}
