import { expect, test } from '@playwright/test';

/**
 * An agent's public page (migration 0041), on the CI fixture: the same
 * AgentProfile component /agent/[key] renders for real agents.
 */
test('the agent page shows the agent, live listings, then sold ones', async ({ page }) => {
  await page.goto('/template-check/agent/');
  await expect(page.locator('h1')).toHaveText('נועה כהן');
  await expect(page.locator('.ap-licence')).toBeVisible();

  const live = page.locator('section[aria-labelledby="ap-live"] .ap-card');
  const sold = page.locator('section[aria-labelledby="ap-sold"] .ap-card');
  await expect(live).toHaveCount(2);
  await expect(sold).toHaveCount(1);
  await expect(sold.locator('.ap-tag')).toHaveText('נמכר');
  await expect(sold.locator('.ap-price')).toHaveCount(0);

  // Every card goes to its listing; no card names a building.
  for (const href of await page.locator('.ap-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('href')))) {
    expect(href).toMatch(/^\/a\/[0-9A-Z]{5}\/$/);
  }
  for (const place of await page.locator('.ap-place').allTextContents()) {
    expect(place).not.toMatch(/\d/);
  }
});

test('the agent page fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/template-check/agent/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
