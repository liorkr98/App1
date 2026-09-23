import type {
  CivicKind,
  NearbyCivic,
  NearbyPlace,
  PlaceCategory,
  TransitMode,
} from '@/types/listing';

/**
 * Presentation for the enrichment section.
 *
 * Labels and ordering only — no data access. What the page shows was decided
 * at publish time and baked into the payload; this file decides how it reads.
 */

/**
 * Hebrew mode labels.
 *
 * רכבת קלה is kept distinct from אוטובוס throughout the pipeline for one
 * reason, and this is where it pays off: for a Tel Aviv reader it is often the
 * single most valuable line on the page.
 */
const MODE_LABELS: Record<TransitMode, string> = {
  light_rail: 'רכבת קלה',
  metro: 'מטרו',
  train: 'רכבת',
  bus: 'אוטובוס',
};

export const modeLabel = (mode: TransitMode): string => MODE_LABELS[mode];

/** Plural Hebrew headings — these label a group, not one item. */
const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  grocery: 'מכולת וסופרמרקט',
  restaurant: 'מסעדות',
  cafe: 'בתי קפה',
  pharmacy: 'בתי מרקחת',
  park: 'פארקים וגינות',
  culture: 'תרבות',
  gym: 'חדרי כושר',
};

export const categoryLabel = (category: PlaceCategory): string => CATEGORY_LABELS[category];

/**
 * Display order for place categories.
 *
 * Daily needs before leisure. Someone deciding where to live wants to know
 * about the grocery and the pharmacy before the gym, and the payload's own
 * order is by walking time, which would interleave them meaninglessly.
 */
const CATEGORY_ORDER: PlaceCategory[] = [
  'grocery',
  'pharmacy',
  'park',
  'cafe',
  'restaurant',
  'culture',
  'gym',
];

export interface PlaceGroup {
  category: PlaceCategory;
  label: string;
  places: NearbyPlace[];
}

/**
 * Groups places by category, in display order, dropping empty groups.
 *
 * An empty group is OMITTED rather than rendered as a heading with nothing
 * under it (CLAUDE.md §7). A moshav with no pharmacy nearby should read as a
 * page about a quiet place, not a page with a hole in it.
 */
export function groupPlaces(places: NearbyPlace[]): PlaceGroup[] {
  const groups: PlaceGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const matching = places.filter((place) => place.category === category);
    if (matching.length === 0) continue;

    groups.push({
      category,
      label: categoryLabel(category),
      places: [...matching].sort((a, b) => a.walkMinutes - b.walkMinutes),
    });
  }

  return groups;
}

export interface CivicGroup {
  kind: CivicKind;
  items: NearbyCivic[];
}

const CIVIC_ORDER: CivicKind[] = ['police', 'parking', 'park_ride'];

/**
 * Groups civic sites by kind, dropping empty groups.
 *
 * Same omit-empty rule as places. A listing with no police desk in walking
 * distance should not grow a heading that says משטרה and then nothing.
 */
export function groupCivic(civic: NearbyCivic[]): CivicGroup[] {
  const groups: CivicGroup[] = [];

  for (const kind of CIVIC_ORDER) {
    const matching = civic.filter((item) => item.kind === kind);
    if (matching.length === 0) continue;
    groups.push({
      kind,
      items: [...matching].sort((a, b) => a.walkMinutes - b.walkMinutes),
    });
  }

  return groups;
}

export {
  enrichmentHasContent,
  leftoverCount,
  orderTransit,
} from '@/features/listings/enrichment-view';

/**
 * One citation line per source, deduplicated.
 *
 * Every item carries its own sourceName and sourceDate because two sources can
 * have been synced on different days (CLAUDE.md §7). Rendering that per item
 * would be unreadable noise, so the section footer states each source once —
 * and if two dates ever differ for the same body, both appear rather than one
 * silently winning.
 */
export function citations(
  items: { sourceName: string; sourceDate: string }[],
): { sourceName: string; sourceDate: string }[] {
  const seen = new Map<string, { sourceName: string; sourceDate: string }>();

  for (const item of items) {
    if (!item.sourceName || !item.sourceDate) continue;
    seen.set(`${item.sourceName}|${item.sourceDate}`, {
      sourceName: item.sourceName,
      sourceDate: item.sourceDate,
    });
  }

  return [...seen.values()];
}
