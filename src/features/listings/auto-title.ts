import type { Fact } from '../../types/listing.js';
import type { ListingCategory } from './schemas/index.js';

/**
 * A title made from what the agent already typed (11 Oct 2026).
 *
 * The title was the second thing the editor asked for, before a single
 * photograph, and an empty title blocks publishing. For an agent who is not
 * a copywriter that is a blank box between them and their link. So the
 * editor fills it from the facts — "דירת 4 חדרים בתל אביב", "מאזדה 3 2019" —
 * and keeps filling it until the agent types their own.
 *
 * Only what was answered. Never a house number (CLAUDE.md §7): the street is
 * not used at all, the city is enough to be found.
 */
function value(facts: readonly Fact[], key: string): string | number | undefined {
  const fact = facts.find((item) => item.key === key);
  if (!fact || !fact.present) return undefined;
  if (typeof fact.value === 'number' && Number.isFinite(fact.value) && fact.value > 0) return fact.value;
  if (typeof fact.value === 'string' && fact.value.trim() !== '') return fact.value.trim();
  return undefined;
}

export function autoTitle(
  category: ListingCategory | undefined,
  facts: readonly Fact[],
  city?: string,
): string {
  if (category === 'vehicle') {
    return [value(facts, 'make'), value(facts, 'model'), value(facts, 'year')]
      .filter((part) => part !== undefined)
      .join(' ');
  }
  if (category !== 'property') return '';

  const rooms = value(facts, 'rooms');
  const place = city?.trim();
  const what =
    typeof rooms === 'number'
      ? rooms === 1
        ? 'דירת חדר'
        : `דירת ${rooms} חדרים`
      : 'דירה';
  if (!place) return typeof rooms === 'number' ? what : '';
  return `${what} ב${place}`;
}
