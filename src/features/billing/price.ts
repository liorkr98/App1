import { PRICING, type Plan, type PlanKey } from './pricing-config.js';
import { seatsLeft, type CohortCount } from './seats.js';

export type { CohortCount };

/**
 * How a plan's price is SAID (docs/PRICING.md §4). Display only.
 *
 *   B2B      "₪29 לחודש + מע״מ"   amount excludes VAT
 *   private  "₪19 כולל מע״מ"      amount includes VAT (consumer law)
 *
 * The number goes in its own <bdi> at render (CLAUDE.md §4.2); this returns
 * the pieces, not a sentence, so the renderer can do that.
 */

export function planByKey(key: PlanKey): Plan {
  const plan = PRICING.plans.find((candidate) => candidate.key === key);
  if (!plan) throw new Error(`unknown plan ${key}`);
  return plan;
}

/** "₪29" or "₪9.90": whole shekels without decimals, otherwise two. */
export function shekels(agorot: number): string {
  if (!Number.isInteger(agorot) || agorot < 0) throw new Error(`bad amount ${agorot}`);
  const whole = agorot % 100 === 0;
  return `₪${whole ? String(agorot / 100) : (agorot / 100).toFixed(2)}`;
}

export type PriceTerms = 'free' | 'perMonthPlusVat' | 'oneTimeInclVat';

export interface PriceParts {
  /** The number as written, e.g. "₪29". */
  amount: string;
  /** Which locale template frames it (pricing.terms.*). */
  terms: PriceTerms;
}

export function priceParts(plan: Plan): PriceParts {
  if (plan.kind === 'free') return { amount: shekels(0), terms: 'free' };
  if (plan.kind === 'subscription') {
    if (plan.vatInclusive) throw new Error(`${plan.key}: B2B prices are quoted before VAT`);
    return { amount: shekels(plan.amountAgorot), terms: 'perMonthPlusVat' };
  }
  if (!plan.vatInclusive) throw new Error(`${plan.key}: private prices are quoted with VAT`);
  return { amount: shekels(plan.amountAgorot), terms: 'oneTimeInclVat' };
}

/** The VAT-inclusive total of a B2B amount, rounded to the agora. */
export function withVat(agorot: number, vatPercent: number = PRICING.vatPercent): number {
  return Math.round((agorot * (100 + vatPercent)) / 100);
}

/**
 * Which plan the pricing page offers for an audience, given the REAL seat
 * counts (PRICING §6: never fake scarcity). A full cohort, or counts we could
 * not read, offers the regular price: a launch price is shown only while a
 * seat demonstrably remains.
 */
export function offeredPlan(launch: PlanKey, counts: readonly CohortCount[] | null): { plan: Plan; seatsLeft: number | null } {
  const plan = planByKey(launch);
  if (!plan.cohort || !plan.regularPlan) return { plan, seatsLeft: null };
  const left = seatsLeft(counts, plan.cohort);
  if (left === null) return { plan: planByKey(plan.regularPlan), seatsLeft: null };
  return left > 0 ? { plan, seatsLeft: left } : { plan: planByKey(plan.regularPlan), seatsLeft: 0 };
}
