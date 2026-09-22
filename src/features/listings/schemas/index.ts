import type {
  CategorySchema,
  Fact,
  FactDefinition,
  ListingAudience,
} from '@/types/listing.js';

import { propertySchema } from './property.js';
import { vehicleSchema } from './vehicle.js';

/**
 * Category registry.
 *
 * ADDING A THIRD CATEGORY: write the schema file, add one line here. Nothing
 * else in the codebase changes — `ListingCategory` widens automatically, so
 * every switch and lookup that consumes it either keeps working or fails to
 * compile at the exact place that needs a decision.
 *
 * One line rather than zero because Metro cannot glob a directory at build
 * time. An explicit registry is also greppable, which a glob is not.
 */
export const CATEGORY_SCHEMAS = {
  property: propertySchema,
  vehicle: vehicleSchema,
} as const satisfies Record<string, CategorySchema>;

/** Derived from the registry — never written out by hand. */
export type ListingCategory = keyof typeof CATEGORY_SCHEMAS;

export const LISTING_CATEGORIES = Object.keys(CATEGORY_SCHEMAS) as ListingCategory[];

export function schemaFor(category: ListingCategory): CategorySchema {
  return CATEGORY_SCHEMAS[category];
}

/** Looks up one definition. Returns undefined for an unknown key. */
export function factDefinition(
  category: ListingCategory,
  key: string,
): FactDefinition | undefined {
  return CATEGORY_SCHEMAS[category].facts.find((fact) => fact.key === key);
}

/** The three required keys for a category. Used to gate publishing. */
export function requiredFactKeys(category: ListingCategory): string[] {
  return CATEGORY_SCHEMAS[category].facts
    .filter((fact) => fact.required === true)
    .map((fact) => fact.key);
}

/**
 * Whether this field is a question for this buyer.
 *
 * An unanswered audience is treated as resident: that is the default path,
 * not a third kind of listing. `both` sees every field that names it.
 */
export function factVisibleFor(
  definition: FactDefinition | undefined,
  audience: ListingAudience | undefined,
): boolean {
  const allowed = definition?.forAudience;
  if (!allowed || allowed.length === 0) return true;
  const current = audience ?? 'resident';
  return (allowed as readonly string[]).includes(current);
}

/**
 * Whether a dependent field has the parent answer it needs.
 *
 * Rent amount waits on "there are tenants". A missing parent is unanswered,
 * which is not yes — so the child stays hidden.
 */
export function factUnlocked(
  definition: FactDefinition | undefined,
  facts: readonly Fact[],
): boolean {
  const parentKey = definition?.requires;
  if (!parentKey) return true;
  return facts.find((fact) => fact.key === parentKey)?.value === true;
}

/** Show this fact in the editor and on the page, for this audience. */
export function factShown(
  definition: FactDefinition | undefined,
  audience: ListingAudience | undefined,
  facts: readonly Fact[],
): boolean {
  return factVisibleFor(definition, audience) && factUnlocked(definition, facts);
}

export { propertySchema } from './property.js';
export { vehicleSchema } from './vehicle.js';
