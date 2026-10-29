import { PRICING, type Plan, type PlanKey } from '@/features/billing/pricing-config';
import { planByKey, priceParts } from '@/features/billing/price';

/**
 * The values each plan's note and price template need, all from the one
 * price list (src/features/billing/pricing-config.ts). Display only — what a
 * person may publish is decided in the database (CLAUDE.md §8).
 */
export function noteValues(plan: Plan): Record<string, string | number> {
  return {
    pages: plan.pageLimit ?? PRICING.freePageLimit,
    free: PRICING.freePageLimit,
    months: PRICING.lockMonths,
    annual: plan.annualMonths ?? 0,
    // Annual is annualMonths payments for twelve months (PRICING §1): the rest is the gift.
    gift: plan.annualMonths ? 12 - plan.annualMonths : 0,
    seats: plan.seats ?? 0,
    days: plan.pageTtlDays ?? 0,
  };
}

export function termsPath(plan: Plan): string {
  return `billing.terms.${priceParts(plan).terms}`;
}

export function amount(plan: Plan): string {
  return priceParts(plan).amount;
}

export function cohortCap(key: PlanKey): number {
  const plan = planByKey(key);
  return PRICING.cohorts.find((row) => row.cohort === plan.cohort)?.cap ?? 0;
}

/** schema.org Offer for a plan, the same numbers the page shows (SEO plan §4.2). */
export function offerLd(plan: Plan, url: string, name: string) {
  return {
    '@type': 'Offer',
    name,
    url,
    price: (plan.amountAgorot / 100).toFixed(2),
    priceCurrency: 'ILS',
    priceSpecification: {
      '@type': plan.interval ? 'UnitPriceSpecification' : 'PriceSpecification',
      price: (plan.amountAgorot / 100).toFixed(2),
      priceCurrency: 'ILS',
      valueAddedTaxIncluded: plan.vatInclusive,
      ...(plan.interval ? { unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } : {}),
    },
  };
}
