import type { Fact } from '@/types/listing.js';

import { factDefinition } from './schemas/index.js';

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
  /**
   * The bi-monthly bill as entered. The monthly line shows both, derived
   * from this one stored figure — never a second arnona the seller typed.
   */
  arnonaBillIls: number;
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
  return { arnonaIls: arnonaBill / 2, arnonaBillIls: arnonaBill, vaadIls: vaad };
}

/**
 * Every arnona figure the page is allowed to paint, from the one stored bill.
 *
 * The grid does not carry arnona (`showInGrid: false`). The monthly line
 * shows the half and the bill together, both derived here. A grid cell with
 * its own number is a second representation and fails `arnonaFiguresAgree`.
 */
export function arnonaOnPage(facts: readonly Fact[]): {
  grid: number | null;
  monthly: number | null;
  bill: number | null;
} {
  const stored = numericPresent(facts, 'property_tax');
  const definition = factDefinition('property', 'property_tax');
  const grid = stored !== null && definition?.showInGrid !== false ? stored : null;
  if (stored === null) return { grid, monthly: null, bill: null };
  return { grid, monthly: stored / 2, bill: stored };
}

/**
 * True when the page does not state arnona twice as two different amounts.
 *
 * The stored bill is bi-monthly. Showing that bill in the grid and half of
 * it, unlabeled, on the monthly line is the contradiction. The grid must be
 * absent, and the monthly figure must be exactly half the bill beside it.
 */
export function arnonaFiguresAgree(facts: readonly Fact[]): boolean {
  const shown = arnonaOnPage(facts);
  if (shown.grid !== null) return false;
  if (shown.monthly === null || shown.bill === null) return true;
  return shown.monthly * 2 === shown.bill;
}

/**
 * Floor `3 / 5` is one bidi run. Two sibling `<bdi>`s reorder to `5 / 3`.
 */
export function pairedCellText(value: string, pairedValue?: string): string {
  return pairedValue === undefined ? value : `${value} / ${pairedValue}`;
}
