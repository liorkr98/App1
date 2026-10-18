import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { offeredPlan, perPage, planByKey, priceParts, shekels, withVat } from './price.js';
import { PRICING, type Plan } from './pricing-config.js';

/** The repo root, from test-build/features/billing (or src/features/billing). */
const ROOT = join(import.meta.dirname, '..', '..', '..');

function migration(prefix: string): string {
  const dir = join(ROOT, 'supabase', 'migrations');
  const file = readdirSync(dir).find((name) => name.startsWith(prefix));
  assert.ok(file, `migration ${prefix} is missing`);
  return readFileSync(join(dir, file), 'utf8');
}

const PLAN_SEED = /insert into public\.plans[\s\S]*?values([\s\S]*?)on conflict/;

/**
 * The plan rows the LATEST migration that seeds plans writes (0040, then
 * 0045 for the page-count plans), parsed from its VALUES list. An older
 * seed is history: the database ends up with the last one.
 */
function seededPlans(): Map<string, string[]> {
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort().reverse();
  const sql = files.map((name) => readFileSync(join(dir, name), 'utf8')).find((text) => PLAN_SEED.test(text));
  const block = sql ? PLAN_SEED.exec(sql) : null;
  assert.ok(block, 'no plans seed in any migration');
  const rows = new Map<string, string[]>();
  for (const match of block[1]!.matchAll(/\(([^()]*)\)/g)) {
    const cells = match[1]!.split(',').map((cell) => cell.trim().replace(/^'(.*)'$/, '$1'));
    rows.set(cells[0]!, cells);
  }
  return rows;
}

const cell = (value: unknown) => (value === null ? 'null' : String(value));

describe('the price list has one source (docs/PRICING.md)', () => {
  it('the latest plans seed holds exactly the plans in pricing-config.ts', () => {
    const seeded = seededPlans();
    assert.deepEqual([...seeded.keys()].sort(), PRICING.plans.map((plan) => plan.key).sort());
    for (const plan of PRICING.plans) {
      const row = seeded.get(plan.key)!;
      // key, kind, audience, amount, vat_inclusive, interval, annual_months,
      // page_limit, page_ttl_days, category, branding, cohort, regular_plan, seats, sort
      const expected: unknown[] = [
        plan.key, plan.kind, plan.audience, plan.amountAgorot, plan.vatInclusive, plan.interval,
        plan.annualMonths, plan.pageLimit, plan.pageTtlDays, plan.category, plan.branding,
        plan.cohort, plan.regularPlan, plan.seats, plan.sort,
      ];
      assert.deepEqual(row, expected.map(cell), `${plan.key} differs between the migration and pricing-config.ts`);
    }
  });

  it('the cohort caps and billing config match', () => {
    const sql = migration('0040_');
    for (const { cohort, cap } of PRICING.cohorts) {
      assert.match(sql, new RegExp(`\\('${cohort}', ${cap}\\)`), `${cohort} cap`);
    }
    assert.match(
      sql,
      new RegExp(`values \\(true, ${PRICING.vatPercent}, ${PRICING.freePageLimit}, ${PRICING.graceDays}, ${PRICING.lockMonths}, ${PRICING.noticeDays}\\)`),
      'billing_config row',
    );
  });

  it('a launch plan is named after its cohort (the homepage toggle relies on it)', () => {
    for (const plan of PRICING.plans) {
      if (plan.cohort) assert.equal(plan.key, plan.cohort);
    }
  });

  it('matches the decisions in PRICING.md §1', () => {
    assert.equal(planByKey('agent_launch').regularPlan, 'agent');
    // Agents buy by active pages (18 Oct 2026): 5, 10 or unlimited, and the
    // launch price is the 10-page plan.
    assert.equal(planByKey('agent_basic').pageLimit, 5);
    assert.equal(planByKey('agent').pageLimit, 10);
    assert.equal(planByKey('agent_unlimited').pageLimit, null);
    assert.equal(planByKey('agent_launch').pageLimit, planByKey('agent').pageLimit);
    assert.ok(planByKey('agent_basic').amountAgorot < planByKey('agent').amountAgorot);
    assert.ok(planByKey('agent').amountAgorot < planByKey('agent_unlimited').amountAgorot);
    // Car dealers buy the same plans (18 Oct 2026): none of them is for one category.
    for (const key of ['agent_basic', 'agent', 'agent_unlimited', 'agent_launch'] as const) {
      assert.equal(planByKey(key).category, null, `${key} covers flats and cars`);
    }
    assert.equal(planByKey('private_sale').pageTtlDays, 90);
    assert.equal(planByKey('private_rent').pageTtlDays, 60);
    assert.equal(planByKey('private_car').pageTtlDays, 60);
    assert.equal(planByKey('office').seats, 10);
    for (const plan of PRICING.plans) {
      if (plan.kind === 'subscription') assert.equal(plan.vatInclusive, false, `${plan.key} is B2B, quoted before VAT`);
      if (plan.kind === 'one_time') assert.equal(plan.vatInclusive, true, `${plan.key} is private, quoted with VAT`);
    }
  });
});

describe('how a price is said (PRICING §4)', () => {
  it('writes whole shekels without decimals and the rest with two', () => {
    assert.equal(shekels(2900), '₪29');
    assert.equal(shekels(990), '₪9.90');
    assert.equal(shekels(0), '₪0');
    assert.throws(() => shekels(-1));
    assert.throws(() => shekels(1.5));
  });

  it('B2B is per month plus VAT, private includes VAT', () => {
    assert.deepEqual(priceParts(planByKey('agent_launch')), { amount: '₪29', terms: 'perMonthPlusVat' });
    assert.deepEqual(priceParts(planByKey('private_sale')), { amount: '₪19', terms: 'oneTimeInclVat' });
    assert.deepEqual(priceParts(planByKey('private_car')), { amount: '₪9.90', terms: 'oneTimeInclVat' });
    assert.deepEqual(priceParts(planByKey('free')), { amount: '₪0', terms: 'free' });
  });

  it('refuses a plan quoted the wrong way round', () => {
    const wrong: Plan = { ...planByKey('agent'), vatInclusive: true };
    assert.throws(() => priceParts(wrong));
  });

  it('says what one active page costs, only where there is a cap', () => {
    assert.equal(perPage(planByKey('agent')), '₪4.90');
    assert.equal(perPage(planByKey('agent_basic')), '₪5.80');
    assert.equal(perPage(planByKey('agent_launch')), '₪2.90');
    assert.equal(perPage(planByKey('agent_unlimited')), null);
    assert.equal(perPage(planByKey('free')), null);
    assert.equal(perPage(planByKey('private_sale')), null);
  });

  it('adds VAT at the configured rate', () => {
    assert.equal(withVat(2900), 3422);
    assert.equal(withVat(4900, 17), 5733);
  });
});

describe('the launch price is offered only while a real seat remains', () => {
  it('offers the launch plan with the true count', () => {
    const { plan, seatsLeft } = offeredPlan('agent_launch', [{ cohort: 'agent_launch', used: 37, cap: 200 }]);
    assert.equal(plan.key, 'agent_launch');
    assert.equal(seatsLeft, 163);
  });

  it('offers the regular plan when the cohort is full', () => {
    const { plan, seatsLeft } = offeredPlan('agent_launch', [{ cohort: 'agent_launch', used: 200, cap: 200 }]);
    assert.equal(plan.key, 'agent');
    assert.equal(seatsLeft, 0);
  });

  it('offers the regular plan when the count could not be read: never an unproven launch price', () => {
    assert.equal(offeredPlan('agent_launch', null).plan.key, 'agent');
    assert.equal(offeredPlan('agent_launch', []).plan.key, 'agent');
  });
});
