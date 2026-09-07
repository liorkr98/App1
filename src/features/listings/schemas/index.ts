import type { CategorySchema, FactDefinition } from '@/types/listing';

import { propertySchema } from './property';
import { vehicleSchema } from './vehicle';

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

export { propertySchema } from './property';
export { vehicleSchema } from './vehicle';
