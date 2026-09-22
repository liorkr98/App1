import type { Fact } from '@/types/listing.js';

/**
 * Estimated monthly carrying cost, only when both arnona and va’ad are present.
 *
 * Arnona is stored as the bi-monthly bill (`₪ לחודשיים` on the schema). The
 * line the buyer reads is monthly, so this halves that figure. Va’ad is already
 * a monthly number. Either fact unanswered, absent, or non-numeric → no line.
 * The page must not invent a total from one of the two.
 */
export interface MonthlyCost {
  /** Arnona as a monthly shekel amount (half the stored bi-monthly bill). */
  arnonaIls: number;
  /** Va’ad, already monthly. */
  vaadIls: number;
}

function numericPresent(facts: readonly Fact[], key: string): number | null {
  const fact = facts.find((candidate) => candidate.key === key);
  if (!fact || fact.present === false) return null;
  if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) return null;
  return fact.value;
}

export function monthlyCost(facts: readonly Fact[]): MonthlyCost | null {
  const arnonaBill = numericPresent(facts, 'property_tax');
  const vaad = numericPresent(facts, 'building_fee');
  if (arnonaBill === null || vaad === null) return null;
  return { arnonaIls: arnonaBill / 2, vaadIls: vaad };
}

/**
 * Floor `3 / 5` is one bidi run. Two sibling `<bdi>`s reorder to `5 / 3`.
 */
export function pairedCellText(value: string, pairedValue?: string): string {
  return pairedValue === undefined ? value : `${value} / ${pairedValue}`;
}
