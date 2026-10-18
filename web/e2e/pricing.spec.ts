import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * The price list as a buyer reads it (docs/PRICING.md §4, §6, §9).
 *
 *  - B2B prices say "+ מע״מ", private prices say "כולל מע״מ", and the number
 *    is in its own <bdi> (CLAUDE.md §4.2).
 *  - The launch price appears ONLY when the real seat count says one is left
 *    — never on a count we could not read, never on a full cohort.
 */

/** Answers the page's read of cohort_counters, or fails it. */
async function seats(page: Page, rows: { cohort: string; used: number; cap: number }[] | 'fail') {
  await page.route(/supabase\.co\/rest\/v1\/cohort_counters/, (route) =>
    rows === 'fail'
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }),
  );
  await page.route(/supabase\.co\/(?!rest\/v1\/cohort_counters)/, (route) => route.abort());
}

const card = (page: Page, key: string) => page.locator(`[data-card="${key}"]`);

test.describe('the price list', () => {
  test.use({ viewport: PHONE, locale: 'he-IL' });

  test('B2B plus VAT, private including VAT, every number in <bdi>', async ({ page }) => {
    await seats(page, 'fail');
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });

    const agent = card(page, 'agent_launch').locator('[data-variant="regular"] .pr-sum');
    await expect(agent).toContainText('לחודש + מע״מ');
    await expect(agent.locator('bdi')).toHaveText('₪49');

    const privates = page.locator('.pr-private-list .pr-sum');
    await expect(privates.first()).toContainText('כולל מע״מ');
    await expect(privates.first().locator('bdi')).toHaveText('₪19');
    await expect(privates.nth(1).locator('bdi')).toHaveText('₪9.90');

    // No digit on the page sits outside a <bdi> inside the price cards.
    const bare = await page.locator('.pr-tier, .pr-private-list li').evaluateAll((cards) =>
      cards.flatMap((cardEl) => {
        const walker = document.createTreeWalker(cardEl, NodeFilter.SHOW_TEXT);
        const out: string[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (/\d/.test(node.textContent ?? '') && !node.parentElement?.closest('bdi')) out.push(node.textContent!.trim());
        }
        return out;
      }),
    );
    expect(bare).toEqual([]);
  });

  test('agents choose by active pages: 5, 10 and unlimited, 10 recommended', async ({ page }) => {
    await seats(page, 'fail');
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });

    // The first three cards are the agent plans, in this order (index 0 is
    // the rightmost in RTL).
    const sums = page.locator('.pr-tier [data-variant="regular"] .pr-sum bdi');
    await expect(sums.nth(0)).toHaveText('₪29');
    await expect(sums.nth(1)).toHaveText('₪49');
    await expect(sums.nth(2)).toHaveText('₪79');

    const recommended = page.locator('.pr-tier.is-featured');
    await expect(recommended).toHaveCount(1);
    await expect(recommended).toHaveAttribute('data-card', 'agent_launch');
    await expect(recommended.locator('.pr-pick')).toHaveText('מומלץ');

    // What one active page costs, on the capped plans only.
    await expect(recommended.locator('[data-variant="regular"] .pr-per bdi')).toHaveText('₪4.90');
    await expect(page.locator('.pr-tier').nth(0).locator('.pr-per bdi')).toHaveText('₪5.80');
    await expect(page.locator('.pr-tier').nth(2).locator('.pr-per')).toHaveCount(0);
  });

  test('a count that could not be read keeps the regular price and shows no counter', async ({ page }) => {
    await seats(page, 'fail');
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    await expect(card(page, 'agent_launch').locator('[data-variant="launch"]')).toBeHidden();
    await expect(page.locator('h1 bdi')).toHaveText('₪29');
    await expect(page.locator('[data-seats]')).toBeHidden();
  });

  test('with seats left: the launch price and the true count', async ({ page }) => {
    await seats(page, [
      { cohort: 'agent_launch', used: 37, cap: 200 },
      { cohort: 'dealer_launch', used: 100, cap: 100 },
    ]);
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });

    await expect(card(page, 'agent_launch').locator('[data-variant="launch"]')).toBeVisible();
    await expect(card(page, 'agent_launch').locator('[data-variant="launch"] .pr-sum bdi')).toHaveText('₪29');
    await expect(card(page, 'agent_launch').locator('[data-variant="launch"] .pr-per bdi')).toHaveText('₪2.90');
    await expect(page.locator('[data-seats="agent_launch"]')).toContainText('163');
    await expect(page.locator('[data-seats="agent_launch"] bdi').first()).toHaveText('163');

    // The dealer cohort is full: its card stays at the regular price.
    await expect(card(page, 'dealer_launch').locator('[data-variant="launch"]')).toBeHidden();
    await expect(card(page, 'dealer_launch').locator('[data-variant="regular"] .pr-sum bdi')).toHaveText('₪49');
  });

  test('a full cohort says so, with the real cap', async ({ page }) => {
    await seats(page, [{ cohort: 'agent_launch', used: 200, cap: 200 }]);
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-seats="agent_launch"]')).toContainText('200');
    await expect(card(page, 'agent_launch').locator('[data-variant="launch"]')).toBeHidden();
  });

  test('the homepage strip follows the same rule', async ({ page }) => {
    await seats(page, [{ cohort: 'agent_launch', used: 1, cap: 200 }]);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const strip = page.locator('.price-tiers [data-card="agent_launch"]');
    await expect(strip.locator('[data-variant="launch"] .price-tier-sum bdi')).toHaveText('₪29');
    await expect(strip.locator('[data-variant="regular"]')).toBeHidden();
  });
});

test('the pricing page offers every plan to search engines, VAT stated', async ({ page }) => {
  await page.goto(`${BASE}/pricing/`, { waitUntil: 'load' });
  const graph = await page.locator('script[type="application/ld+json"]').first().textContent();
  const nodes = (JSON.parse(graph ?? '{}') as { '@graph': { '@type': string; offers?: { priceSpecification: { valueAddedTaxIncluded: boolean }; price: string }[] }[] })['@graph'];
  const product = nodes.find((node) => node['@type'] === 'Product');
  expect(product?.offers?.length).toBe(11);
  const vat = product!.offers!.map((offer) => offer.priceSpecification.valueAddedTaxIncluded);
  expect(vat.filter(Boolean).length).toBe(4); // free + three private plans
});
