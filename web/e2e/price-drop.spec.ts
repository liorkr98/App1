import { expect, test } from '@playwright/test';

/**
 * "המחיר ירד" (migration 0043), on fixtures whose price came down two days
 * before the build: the old price crossed out beside the tag, in the composed
 * first screen and in a 1.x template, and the same ribbon on the card.
 */
for (const id of ['aurora', 'agency']) {
  test(`the page shows the drop, the old price crossed out (${id})`, async ({ page }) => {
    await page.goto(`/template-check/drop-${id}/`);
    const drop = page.locator('.price-drop').first();
    await expect(drop).toBeVisible();
    await expect(drop.locator('.price-drop-tag')).toHaveText('המחיר ירד');
    // The old figure is crossed out and isolated, and higher than the price now.
    const was = Number((await drop.locator('s bdi').textContent())?.replace(/[^0-9]/g, ''));
    const now = Number((await page.locator('.price-bar .price bdi').first().textContent())?.replace(/[^0-9]/g, ''));
    expect(was).toBeGreaterThan(now);
  });
}

test('an ordinary page shows no drop', async ({ page }) => {
  await page.goto('/template-check/aurora/');
  await expect(page.locator('.price-drop')).toHaveCount(0);
});

test('the card carries the ribbon', async ({ page }) => {
  await page.goto('/template-check/card/drop/');
  await expect(page.locator('.cd-ribbon')).toContainText('המחיר ירד');
  await expect(page.locator('.cd-ribbon s bdi')).toHaveCount(1);
});

test('the drop fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/template-check/drop-aurora/');
  await expect(page.locator('.price-drop').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
