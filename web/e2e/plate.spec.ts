import { expect, test } from '@playwright/test';

/**
 * Covering a plate (19 Oct 2026, CLAUDE.md §7). /lab/plate/ runs the
 * editor's own coverPlate on a fixture car: inside the box the photograph
 * loses its detail (a coarse mosaic), outside it keeps it, and the file is
 * the same size as the photograph it replaces.
 */
test('the box becomes a mosaic and the rest of the photograph stays', async ({ page }) => {
  await page.goto('/lab/plate/');
  await page.locator('[data-plate-make]').click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-plate', /done|failed/, { timeout: 30_000 });
  await expect(html).toHaveAttribute('data-plate', 'done');
  const data = await html.evaluate((element) => ({ ...(element as HTMLElement).dataset }));

  expect(data.plateSize).toBe(data.plateSource);
  expect(data.plateType).toBe('image/webp');
  // Neighbouring pixels in a mosaic are mostly equal: detail falls to a fraction.
  expect(Number(data.plateInsideAfter)).toBeLessThan(Number(data.plateInsideBefore) * 0.35);
  // Outside the box, a re-encode and nothing more.
  expect(Number(data.plateOutsideAfter)).toBeGreaterThan(Number(data.plateOutsideBefore) * 0.7);
});
