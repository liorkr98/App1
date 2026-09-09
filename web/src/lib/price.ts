import { factDefinition, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { ils } from './format';

/**
 * The per-unit price under the asking price — ₪19,474 למ״ר.
 *
 * An Israeli buyer comparing two apartments does this division in their head
 * on every listing they open, and gets it wrong on half of them. Doing it on
 * the page is the cheapest useful thing this product can offer, and it costs
 * one line of arithmetic.
 *
 * DERIVED, NEVER DECLARED. It is not a fact and never enters the facts array:
 * a seller cannot type it, so it cannot be wrong, and it carries no
 * provenance badge because it is not a claim anybody made. It is the asking
 * price divided by a number already on the page.
 *
 * The denominator comes from the schema (priceDenominator), so a category
 * without one simply gets nothing here — a vehicle has no area, and inventing
 * a price per kilometre would be worse than an empty line.
 */
export interface PerUnitPrice {
  /** Formatted with the shekel sign, ready for a <bdi>. */
  amount: string;
  /** Hebrew, e.g. למ״ר. */
  per: string;
}

export function perUnitPrice(
  category: ListingCategory,
  facts: readonly Fact[],
  price: number,
): PerUnitPrice | undefined {
  for (const fact of facts) {
    const definition = factDefinition(category, fact.key);
    if (definition?.priceDenominator !== true) continue;

    // present:false is a confirmed absence and value:null is unanswered.
    // Neither can divide anything, and nor can zero.
    if (fact.present === false) return undefined;
    if (typeof fact.value !== 'number' || fact.value <= 0) return undefined;

    const unit = definition.unit ?? fact.unit ?? fact.label;

    return {
      amount: ils(Math.round(price / fact.value)),
      // ל is the Hebrew "per" prefix and attaches directly to the unit:
      // מ״ר becomes למ״ר. No space, no slash — a slash between two Hebrew
      // units in an RTL line is one more neutral character to fight.
      per: `ל${unit}`,
    };
  }

  return undefined;
}
