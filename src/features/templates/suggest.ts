import type { ListingCategory } from '../listings/schemas/index.js';
import type { Fact, TemplateId } from '../../types/listing.js';
import { templateFits } from './manifest.js';

/**
 * "הבחירה של היעד" — which template to suggest, and why, in one line.
 *
 * Only from what the editor already knows about THIS listing; nothing is
 * looked up and nothing is guessed from the photographs. Each template in
 * round two is built on one thing only some listings have (plan §12b), so
 * the suggestion is the first of those this listing actually has:
 *
 *   vehicle    Dossier when a fact carries a public-record source (name
 *              and date — the stamp would otherwise be declared), else
 *              Showroom
 *   property   Blueprint with a floor plan; Heliograph with a balcony
 *              direction and a street (the sun needs both); Monolith when
 *              five or more rooms are named (its pinned room story); else
 *              Aurora, which asks for nothing but one good photograph
 *
 * The result always fits the category (templateFits), so a suggestion can
 * never be the fallback in disguise.
 */
export type SuggestReason = 'verified' | 'car' | 'plan' | 'sun' | 'rooms' | 'photo';

export interface SuggestInput {
  category: ListingCategory;
  facts: readonly Fact[];
  street?: string | undefined;
  /** Distinct rooms named on the photographs. */
  namedRooms: number;
  hasFloorPlan?: boolean;
}

export function suggestTemplate(input: SuggestInput): { id: TemplateId; reason: SuggestReason } {
  const pick = (id: TemplateId, reason: SuggestReason) =>
    templateFits(id, input.category) ? { id, reason } : { id: 'aurora' as TemplateId, reason: 'photo' as const };

  if (input.category === 'vehicle') {
    const verified = input.facts.some(
      (fact) => fact.source === 'verified' && Boolean(fact.sourceName) && Boolean(fact.sourceDate),
    );
    return verified ? pick('dossier', 'verified') : pick('showroom', 'car');
  }

  if (input.hasFloorPlan) return pick('blueprint', 'plan');

  const aspect = input.facts.find((fact) => fact.key === 'aspect');
  const hasAspect = aspect?.present === true && typeof aspect.value === 'string' && aspect.value.trim() !== '';
  if (hasAspect && input.street?.trim()) return pick('heliograph', 'sun');

  if (input.namedRooms >= 5) return pick('monolith', 'rooms');

  return pick('aurora', 'photo');
}
