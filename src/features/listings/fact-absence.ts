import type { FactType } from '../../types/listing.js';

/**
 * Only a boolean may render אין.
 *
 * present:false on a yes/no feature means the seller said the feature is
 * absent. The same flag on a date, a number, a text field or an enum is an
 * empty answer, and an empty answer is omitted — "תאריך כניסה: אין" turns
 * "we were not told" into "there is no date", which is a different claim.
 */
export function absenceIsStated(type: FactType | undefined): boolean {
  return type === 'boolean';
}
