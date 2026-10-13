import { expect, test } from '@playwright/test';

/**
 * The owner's data page (migration 0042), on the CI fixture: the same layout
 * and renderer as /admin/data/, drawn from sample numbers, with a canned AI
 * answer. And the site-visit beacon every site page sends.
 */
test('the data page draws the numbers, the charts and where people stop', async ({ page }) => {
  await page.goto('/template-check/admin-data/');

  await expect(page.locator('.kpi')).toHaveCount(10);
  await expect(page.locator('.kpi-delta.is-good').first()).toBeVisible();
  // Every figure is isolated: no digit sits outside a <bdi> in a tile value.
  for (const text of await page.locator('.kpi-value').evaluateAll((tiles) =>
    tiles.map((tile) => Array.from(tile.childNodes).filter((node) => node.nodeName !== 'BDI').map((node) => node.textContent).join('')),
  )) {
    expect(text).not.toMatch(/\d/);
  }

  // Two line charts: two series, then three, one 2px path each.
  await expect(page.locator('#d-traffic svg path')).toHaveCount(2);
  await expect(page.locator('#d-growth svg path')).toHaveCount(3);
  await expect(page.locator('#d-traffic .d-legend li')).toHaveCount(2);

  // Where people stop: photos, highlighted, and said in words.
  await expect(page.locator('.d-bars li.is-worst .d-bar-name')).toHaveText('תמונות');
  await expect(page.locator('.d-worst')).toContainText('תמונות');

  // The range: 7 days is seven rows in the table behind the chart.
  await page.locator('[data-range="7"]').click();
  await expect(page.locator('[data-range="7"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#d-traffic table tbody tr')).toHaveCount(7);

  // The AI answer, labelled as AI.
  await page.locator('#d-ai-button').click();
  await expect(page.locator('.d-ai-proposals li')).toHaveCount(3);
  await expect(page.locator('.d-ai-note')).toContainText('AI');
});

test('the chart answers a pointer with every series for that day', async ({ page }) => {
  await page.goto('/template-check/admin-data/');
  await expect(page.locator('.kpi')).toHaveCount(10);
  const chart = page.locator('#d-traffic svg');
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  if (!box) throw new Error('no chart');
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tip = page.locator('#d-traffic .d-tip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('.d-tip-row')).toHaveCount(2);
});

test('the data page fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/template-check/admin-data/');
  await expect(page.locator('.kpi')).toHaveCount(10);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a site page sends one visit per tab, with its address and referrer', async ({ page }) => {
  const sent: string[] = [];
  await page.route('**/api/site-view', async (route) => {
    sent.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204 });
  });
  await page.goto('/pricing/?utm_source=newsletter');
  await expect.poll(() => sent.length).toBe(1);
  const [address, referrer] = (sent[0] ?? '').split('\n');
  expect(new URL(address ?? '').pathname).toBe('/pricing/');
  expect(new URL(address ?? '').searchParams.get('utm_source')).toBe('newsletter');
  expect(referrer).toBe('');

  await page.reload();
  await page.goto('/agents/');
  await expect.poll(() => sent.length).toBe(2);
  await page.waitForTimeout(300);
  expect(sent.length).toBe(2);
});
