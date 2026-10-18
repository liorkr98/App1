/**
 * docs/PRICING.md as data (decided 12 Oct 2026).
 *
 * THE ONLY FILE IN src/ OR web/src WHERE A PRICE IS WRITTEN. The latest
 * migration that seeds `public.plans` (0045, after 0040) holds the same rows;
 * pricing.test.ts fails if the two disagree, and scripts/verify-no-price-literals.mjs fails the build on a
 * price anywhere else. Change a price here AND in a new migration, never in
 * a component.
 *
 * Amounts are agorot (integers). B2B amounts exclude VAT and are shown with
 * "+ מע״מ"; private amounts include it (consumer law) and say so.
 *
 * DISPLAY AND SEED ONLY. Nothing here decides who may publish: that is
 * `publish_decision()` in the database (CLAUDE.md §8).
 */

export type PlanKey =
  | 'free'
  | 'agent_launch'
  | 'agent_basic'
  | 'agent'
  | 'agent_unlimited'
  | 'office'
  | 'dealer_launch'
  | 'dealer'
  | 'private_sale'
  | 'private_rent'
  | 'private_car';

export type PlanKind = 'free' | 'subscription' | 'one_time';
export type Audience = 'any' | 'agent' | 'office' | 'dealer' | 'private';

export interface Plan {
  key: PlanKey;
  kind: PlanKind;
  audience: Audience;
  amountAgorot: number;
  vatInclusive: boolean;
  interval: 'month' | null;
  /** Annual billing is this many monthly payments (PRICING §1: 10×). */
  annualMonths: number | null;
  /**
   * Published or sold pages at once. null = unlimited. Agent plans are sold
   * by this number (decided 18 Oct 2026): 5, 10 or unlimited.
   */
  pageLimit: number | null;
  pageTtlDays: number | null;
  category: 'property' | 'vehicle' | null;
  /** Agent branding allowed and our credit removed. */
  branding: boolean;
  cohort: 'agent_launch' | 'dealer_launch' | null;
  regularPlan: PlanKey | null;
  seats: number | null;
  sort: number;
}

export const PRICING = {
  vatPercent: 18,
  freePageLimit: 2,
  graceDays: 7,
  lockMonths: 12,
  noticeDays: 30,
  plans: [
    { key: 'free', kind: 'free', audience: 'any', amountAgorot: 0, vatInclusive: true, interval: null, annualMonths: null, pageLimit: 2, pageTtlDays: null, category: null, branding: false, cohort: null, regularPlan: null, seats: null, sort: 0 },
    { key: 'agent_launch', kind: 'subscription', audience: 'agent', amountAgorot: 2900, vatInclusive: false, interval: 'month', annualMonths: null, pageLimit: 10, pageTtlDays: null, category: null, branding: true, cohort: 'agent_launch', regularPlan: 'agent', seats: null, sort: 1 },
    { key: 'agent_basic', kind: 'subscription', audience: 'agent', amountAgorot: 2900, vatInclusive: false, interval: 'month', annualMonths: 10, pageLimit: 5, pageTtlDays: null, category: null, branding: true, cohort: null, regularPlan: null, seats: null, sort: 2 },
    { key: 'agent', kind: 'subscription', audience: 'agent', amountAgorot: 4900, vatInclusive: false, interval: 'month', annualMonths: 10, pageLimit: 10, pageTtlDays: null, category: null, branding: true, cohort: null, regularPlan: null, seats: null, sort: 3 },
    { key: 'agent_unlimited', kind: 'subscription', audience: 'agent', amountAgorot: 7900, vatInclusive: false, interval: 'month', annualMonths: 10, pageLimit: null, pageTtlDays: null, category: null, branding: true, cohort: null, regularPlan: null, seats: null, sort: 4 },
    { key: 'office', kind: 'subscription', audience: 'office', amountAgorot: 14900, vatInclusive: false, interval: 'month', annualMonths: 10, pageLimit: null, pageTtlDays: null, category: null, branding: true, cohort: null, regularPlan: null, seats: 10, sort: 5 },
    { key: 'dealer_launch', kind: 'subscription', audience: 'dealer', amountAgorot: 2900, vatInclusive: false, interval: 'month', annualMonths: null, pageLimit: null, pageTtlDays: null, category: 'vehicle', branding: true, cohort: 'dealer_launch', regularPlan: 'dealer', seats: null, sort: 6 },
    { key: 'dealer', kind: 'subscription', audience: 'dealer', amountAgorot: 4900, vatInclusive: false, interval: 'month', annualMonths: 10, pageLimit: null, pageTtlDays: null, category: 'vehicle', branding: true, cohort: null, regularPlan: null, seats: null, sort: 7 },
    { key: 'private_sale', kind: 'one_time', audience: 'private', amountAgorot: 1900, vatInclusive: true, interval: null, annualMonths: null, pageLimit: 1, pageTtlDays: 90, category: 'property', branding: false, cohort: null, regularPlan: null, seats: null, sort: 8 },
    { key: 'private_rent', kind: 'one_time', audience: 'private', amountAgorot: 990, vatInclusive: true, interval: null, annualMonths: null, pageLimit: 1, pageTtlDays: 60, category: 'property', branding: false, cohort: null, regularPlan: null, seats: null, sort: 9 },
    { key: 'private_car', kind: 'one_time', audience: 'private', amountAgorot: 990, vatInclusive: true, interval: null, annualMonths: null, pageLimit: 1, pageTtlDays: 60, category: 'vehicle', branding: false, cohort: null, regularPlan: null, seats: null, sort: 10 },
  ] satisfies Plan[] as Plan[],
  cohorts: [
    { cohort: 'agent_launch', cap: 200 },
    { cohort: 'dealer_launch', cap: 100 },
  ] as const,
};
