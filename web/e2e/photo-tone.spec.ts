import { expect, test } from '@playwright/test';

import { BASE } from './measure';

/**
 * The automatic photo fix (19 Oct 2026). /lab/photo-tone/ runs the editor's
 * own stripAndResize on a sample made dark and yellow, with and without the
 * fix, and on the sample as it is.
 */
test('a dark, yellow photo comes out brighter and more neutral; the undo copy is as shot', async ({ page }) => {
  await page.goto(`${BASE}/lab/photo-tone/`);
  await page.locator('[data-tone-make]').click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-tone', /done|failed/, { timeout: 30_000 });
  await expect(html).toHaveAttribute('data-tone', 'done');
  const data = await html.evaluate((element) => ({ ...(element as HTMLElement).dataset }));

  expect(data.toneFixed).toBe('true');
  expect(data.tonePlain).toBe('false');
  expect(Number(data.toneBrightAfter)).toBeGreaterThan(Number(data.toneBrightBefore) + 15);
  expect(Number(data.toneCastAfter)).toBeLessThan(Number(data.toneCastBefore) * 0.75);
});

test('the photo film shows only where the agent turned it on', async ({ page }) => {
  // A listing shaped like a real one, no switch: no film.
  await page.goto(`${BASE}/template-check/R4LSH-aurora/`);
  await expect(page.locator('.film')).toHaveCount(0);
  // The demo, with the switch on: the film.
  await page.goto(`${BASE}/template-check/A7K2M/`);
  await expect(page.locator('.film').first()).toBeAttached();
});
