import type {
  CivicKind,
  EnrichmentBlock,
  NearbyCivic,
  NearbyPlace,
  NearbySchool,
  NearbyTransit,
  NeighborhoodNote,
  PlaceCategory,
  PropertyEnrichment,
  TransitMode,
  VehicleEnrichment,
} from '../../types/listing.js';

import { acceptNeighborhoodNote, type NeighborhoodFacts } from './neighborhood-note.js';

/**
 * Turns a stored JSON payload into the domain type, or undefined.
 *
 * Live pages used to drop listing_enrichment entirely. A malformed payload
 * must not crash the page and must not invent walking times — omit the block.
 */

const TRANSIT_MODES = new Set<TransitMode>(['light_rail', 'train', 'metro', 'bus']);
const PLACE_CATEGORIES = new Set<PlaceCategory>([
  'restaurant',
  'cafe',
  'grocery',
  'pharmacy',
  'park',
  'culture',
  'gym',
]);
const CIVIC_KINDS = new Set<CivicKind>(['police', 'parking', 'park_ride']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asWalk(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 180) {
    return undefined;
  }
  return Math.round(value);
}

function asProvenance(value: Record<string, unknown>): { sourceName: string; sourceDate: string } | undefined {
  if (typeof value.sourceName !== 'string' || value.sourceName.trim() === '') return undefined;
  if (typeof value.sourceDate !== 'string' || value.sourceDate.trim() === '') return undefined;
  return { sourceName: value.sourceName, sourceDate: value.sourceDate };
}

function asTransit(value: unknown): NearbyTransit | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  if (typeof value.mode !== 'string' || !TRANSIT_MODES.has(value.mode as TransitMode)) return undefined;
  const walkMinutes = asWalk(value.walkMinutes);
  const provenance = asProvenance(value);
  if (walkMinutes === undefined || !provenance) return undefined;
  const routes = Array.isArray(value.routes)
    ? value.routes.filter((route): route is string => typeof route === 'string' && route !== '')
    : [];
  return {
    id: value.id,
    name: value.name,
    mode: value.mode as TransitMode,
    routes,
    walkMinutes,
    ...provenance,
  };
}

function asSchool(value: unknown): NearbySchool | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  const walkMinutes = asWalk(value.walkMinutes);
  const provenance = asProvenance(value);
  if (walkMinutes === undefined || !provenance) return undefined;
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : '',
    stream: typeof value.stream === 'string' ? value.stream : '',
    ...(typeof value.gradeSpan === 'string' && value.gradeSpan !== '' ? { gradeSpan: value.gradeSpan } : {}),
    walkMinutes,
    ...provenance,
  };
}

function asPlace(value: unknown): NearbyPlace | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  if (typeof value.category !== 'string' || !PLACE_CATEGORIES.has(value.category as PlaceCategory)) {
    return undefined;
  }
  const walkMinutes = asWalk(value.walkMinutes);
  const provenance = asProvenance(value);
  if (walkMinutes === undefined || !provenance) return undefined;
  return {
    id: value.id,
    name: value.name,
    category: value.category as PlaceCategory,
    walkMinutes,
    ...provenance,
  };
}

function asCivic(value: unknown): NearbyCivic | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  if (typeof value.kind !== 'string' || !CIVIC_KINDS.has(value.kind as CivicKind)) return undefined;
  const walkMinutes = asWalk(value.walkMinutes);
  const provenance = asProvenance(value);
  if (walkMinutes === undefined || !provenance) return undefined;
  return {
    id: value.id,
    name: value.name,
    kind: value.kind as CivicKind,
    walkMinutes,
    ...provenance,
  };
}

function asNote(value: unknown, facts: NeighborhoodFacts): NeighborhoodNote | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') return undefined;
  return acceptNeighborhoodNote(value.text, facts);
}

function asProperty(value: Record<string, unknown>): PropertyEnrichment | undefined {
  const transit = Array.isArray(value.transit) ? value.transit.flatMap((row) => {
    const item = asTransit(row);
    return item ? [item] : [];
  }) : [];
  const schools = Array.isArray(value.schools) ? value.schools.flatMap((row) => {
    const item = asSchool(row);
    return item ? [item] : [];
  }) : [];
  const places = Array.isArray(value.places) ? value.places.flatMap((row) => {
    const item = asPlace(row);
    return item ? [item] : [];
  }) : [];
  const civic = Array.isArray(value.civic) ? value.civic.flatMap((row) => {
    const item = asCivic(row);
    return item ? [item] : [];
  }) : [];

  const summaryRaw = isRecord(value.summary) ? value.summary : {};
  const summary: PropertyEnrichment['summary'] = {};
  if (typeof summaryRaw.restaurantsWithin500m === 'number' && summaryRaw.restaurantsWithin500m > 0) {
    summary.restaurantsWithin500m = Math.round(summaryRaw.restaurantsWithin500m);
  }
  if (isRecord(summaryRaw.nearestGrocery) && typeof summaryRaw.nearestGrocery.name === 'string') {
    const walkMinutes = asWalk(summaryRaw.nearestGrocery.walkMinutes);
    if (walkMinutes !== undefined) {
      summary.nearestGrocery = { name: summaryRaw.nearestGrocery.name, walkMinutes };
    }
  }
  if (isRecord(summaryRaw.nearestPark) && typeof summaryRaw.nearestPark.name === 'string') {
    const walkMinutes = asWalk(summaryRaw.nearestPark.walkMinutes);
    if (walkMinutes !== undefined) {
      summary.nearestPark = { name: summaryRaw.nearestPark.name, walkMinutes };
    }
  }

  const attributions = Array.isArray(value.attributions)
    ? value.attributions.filter((line): line is string => typeof line === 'string' && line !== '')
    : [];

  const note = asNote(value.neighborhoodNote, { transit, schools, places, civic });

  return {
    category: 'property',
    transit,
    schools,
    places,
    ...(civic.length > 0 ? { civic } : {}),
    summary,
    attributions,
    ...(note ? { neighborhoodNote: note } : {}),
  };
}

function asVehicle(value: Record<string, unknown>): VehicleEnrichment | undefined {
  return {
    category: 'vehicle',
    verifiedSpecKeys: Array.isArray(value.verifiedSpecKeys)
      ? value.verifiedSpecKeys.filter((key): key is string => typeof key === 'string')
      : [],
    ownershipHistory: [],
    ...(typeof value.testValidUntil === 'string' ? { testValidUntil: value.testValidUntil } : {}),
  };
}

export function parseEnrichmentBlock(value: unknown): EnrichmentBlock | undefined {
  if (!isRecord(value)) return undefined;
  if (value.category === 'property') return asProperty(value);
  if (value.category === 'vehicle') return asVehicle(value);
  return undefined;
}
