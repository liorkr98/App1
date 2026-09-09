/**
 * OpenStreetMap tags → the seven categories the page displays.
 *
 * We import ONLY these. The Israel extract is a few hundred megabytes of
 * everything — power lines, field boundaries, bus shelters — and importing it
 * whole would give us a slower database and no extra page.
 *
 * ODbL: everything derived from these tags carries attribution wherever it is
 * shown (CLAUDE.md §10). That obligation travels in the enrichment payload
 * rather than being hardcoded in a footer, so a page that drops the places
 * block drops its attribution too.
 */

export type PlaceCategory =
  | 'restaurant'
  | 'cafe'
  | 'grocery'
  | 'pharmacy'
  | 'park'
  | 'culture'
  | 'gym';

/**
 * Tag pairs, in priority order.
 *
 * Ordered because a single feature carries several tags and some overlap: a
 * museum with a café inside is tagged both, and it is a museum. First match
 * wins, so the more specific and more page-worthy entries come first.
 */
const RULES: { key: string; value: string; category: PlaceCategory }[] = [
  // Culture before food: a theatre with a bar is a theatre.
  { key: 'tourism', value: 'museum', category: 'culture' },
  { key: 'amenity', value: 'theatre', category: 'culture' },
  { key: 'amenity', value: 'cinema', category: 'culture' },
  { key: 'amenity', value: 'library', category: 'culture' },
  { key: 'amenity', value: 'arts_centre', category: 'culture' },

  { key: 'amenity', value: 'pharmacy', category: 'pharmacy' },

  // Groceries before restaurants: a supermarket with a deli counter is a
  // supermarket, and "nearest grocery" is a summary field people rely on.
  { key: 'shop', value: 'supermarket', category: 'grocery' },
  { key: 'shop', value: 'convenience', category: 'grocery' },
  { key: 'shop', value: 'greengrocer', category: 'grocery' },
  { key: 'shop', value: 'bakery', category: 'grocery' },

  { key: 'amenity', value: 'cafe', category: 'cafe' },
  { key: 'amenity', value: 'restaurant', category: 'restaurant' },
  { key: 'amenity', value: 'fast_food', category: 'restaurant' },

  { key: 'leisure', value: 'fitness_centre', category: 'gym' },
  { key: 'leisure', value: 'sports_centre', category: 'gym' },

  { key: 'leisure', value: 'park', category: 'park' },
  { key: 'leisure', value: 'garden', category: 'park' },
  { key: 'leisure', value: 'playground', category: 'park' },
];

/** The tag filter to hand `osmium tags-filter`, derived from the rules above. */
export function tagFilterExpressions(): string[] {
  return [...new Set(RULES.map((rule) => `${rule.key}=${rule.value}`))];
}

/** First matching category, or undefined if this feature is not one we show. */
export function toCategory(tags: Record<string, string>): PlaceCategory | undefined {
  for (const rule of RULES) {
    if (tags[rule.key] === rule.value) return rule.category;
  }
  return undefined;
}

/**
 * The name to display, in Hebrew where OSM has one.
 *
 * `name:he` first, then `name`. The order matters more than it looks: OSM's
 * plain `name` in Israel is often the Latin transliteration, and a Hebrew page
 * listing "Cafe Landwer" among Hebrew place names reads as broken — worse
 * than not listing it.
 *
 * Returns undefined for an unnamed feature. A park with no name is a green
 * rectangle we cannot write a sentence about, and "פארק" as a name is a
 * placeholder, which §7 forbids.
 */
export function toName(tags: Record<string, string>): string | undefined {
  const candidates = [tags['name:he'], tags.name, tags['int_name']];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}

/** Hebrew block, for deciding whether a name will read correctly on the page. */
const HEBREW = /[\u0590-\u05FF]/u;

/**
 * True when the name contains Hebrew.
 *
 * Not used to reject — a Latin-only name is still better than no name for a
 * landmark that genuinely has no Hebrew form — but it is counted and reported,
 * because a places list that is 60% Latin is a coverage problem worth seeing
 * rather than a rendering one.
 */
export function isHebrew(name: string): boolean {
  return HEBREW.test(name);
}
