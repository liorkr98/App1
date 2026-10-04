import { expect, test } from '@playwright/test';

import { CARD_PAGES, SITE_PAGES, TEMPLATE_PAGES } from './pages';

/**
 * What each page looks like, in Hebrew, on a phone and on a desktop — so a
 * change to one template's CSS that moves another is seen in the PR, not by a
 * buyer (plan §11).
 *
 * The first screen only, which is what the buyer judges in five seconds and
 * what is stable: below it, lazy images and scroll scenes would make every
 * run differ. Motion off and fonts loaded, so the shot is the page at rest.
 *
 * Baselines are Linux-only and made by the "Update screenshots" workflow on
 * the same image CI compares on (playwright.config.ts says why).
 */
const WIDTHS = [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

test.use({ reducedMotion: 'reduce' });

for (const { name: width, viewport } of WIDTHS) {
  test.describe(width, () => {
    test.use({ viewport });

    for (const page of [...TEMPLATE_PAGES, ...SITE_PAGES]) {
      test(page.name, async ({ page: tab }) => {
        await tab.goto(page.path, { waitUntil: 'networkidle' });
        await tab.evaluate(() => document.fonts.ready);
        await expect(tab).toHaveScreenshot(`${page.name}-${width}.png`);
      });
    }
  });
}

test.describe('cards', () => {
  test.use({ viewport: { width: 1200, height: 630 } });

  for (const page of CARD_PAGES) {
    test(page.name, async ({ page: tab }) => {
      await tab.goto(page.path, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab).toHaveScreenshot(`${page.name}.png`);
    });
  }
});
