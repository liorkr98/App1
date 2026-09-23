import { BRAND_LIST, type BrandCategory } from './brands.he.js';

/**
 * Everyday amenities are ranked by recognition, then distance.
 *
 * A chain 300 metres away tells a buyer more than an unbranded shop at
 * 100 metres. Transit and schools stay on distance — proximity is the
 * point there, and this module does not touch them.
 */

export interface RankablePlace {
  name: string;
  walkMinutes?: number;
}

const EVERYDAY: readonly BrandCategory[] = ['grocery', 'pharmacy', 'cafe', 'fastFood', 'fitness'];

export function brandOf(name: string): { brand: string; category: BrandCategory } | undefined {
  const text = name.trim();
  if (text === '') return undefined;
  return BRAND_LIST.find((entry) => text === entry.brand || text.includes(entry.brand));
}

/**
 * Hebrew name from OSM. `name:he` is required. Latin-only names are a skip,
 * and so is a Hebrew `name` that never got a `name:he` tag.
 */
export function shopName(
  tags: Record<string, string>,
): { name: string } | { skip: 'missing' | 'latin' } {
  const he = tags['name:he']?.trim() ?? '';
  if (he === '') return { skip: 'missing' };
  // Latin-only names are skipped, except a chain whose brand is written in
  // Latin (AM:PM, Be). An unbranded Latin name still tells the buyer nothing.
  if (!/[\u0590-\u05FF]/.test(he) && !brandOf(he)) return { skip: 'latin' };
  return { name: he };
}

/** shop=yes and other untyped shops are noise. Meaningful tags only. */
export function isTypedShop(tags: Record<string, string>): boolean {
  const shop = tags.shop;
  if (shop === 'supermarket' || shop === 'convenience' || shop === 'bakery') return true;
  const amenity = tags.amenity;
  return (
    amenity === 'pharmacy' ||
    amenity === 'cafe' ||
    amenity === 'restaurant' ||
    amenity === 'school' ||
    amenity === 'kindergarten'
  );
}

const CAP = 3;

/**
 * Recognised chains only, one branch each, three per category.
 * A category with no chain is absent from the result.
 */
export function rankEveryday<T extends RankablePlace>(places: readonly T[]): T[] {
  const seen = new Set<string>();
  const buckets = new Map<BrandCategory, T[]>();
  const ordered = [...places].sort(
    (a, b) => (a.walkMinutes ?? Number.POSITIVE_INFINITY) - (b.walkMinutes ?? Number.POSITIVE_INFINITY),
  );

  for (const place of ordered) {
    const hit = brandOf(place.name);
    if (!hit || !EVERYDAY.includes(hit.category) || seen.has(hit.brand)) continue;
    seen.add(hit.brand);
    const list = buckets.get(hit.category) ?? [];
    if (list.length >= CAP) continue;
    list.push(place);
    buckets.set(hit.category, list);
  }

  return EVERYDAY.flatMap((category) => buckets.get(category) ?? []);
}

/** The agent's ticks. Up to eight names, in the order they stored them. */
export function applyPicks<T extends RankablePlace>(
  places: readonly T[],
  picks: readonly string[] | undefined,
): T[] {
  if (!picks || picks.length === 0) return [...places];
  const wanted = picks.slice(0, 8);
  const byName = new Map(places.map((place) => [place.name, place]));
  return wanted.flatMap((name) => {
    const place = byName.get(name);
    return place ? [place] : [];
  });
}
