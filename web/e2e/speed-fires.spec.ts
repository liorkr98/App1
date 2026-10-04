import { expect, test } from '@playwright/test';

import { BASE, LIMITS, measure } from './measure';

/**
 * The speed check must be able to fail (CLAUDE.md §4.1: a rule that silently
 * stops firing is worse than no rule). A page that pushes everything down by
 * a block inserted after it rendered — the classic late, unsized banner — has
 * to measure over the layout-shift limit, or the measurement is broken and
 * every green run above means nothing.
 */
test('a late block above the content is caught as a layout shift', async ({ browser }) => {
  const result = await measure(browser, `${BASE}/template-check/T4V7A-aurora/`, async (page) => {
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const block = document.createElement('div');
          block.style.blockSize = '320px';
          document.body.prepend(block);
        }, 300);
      });
    });
  });
  expect(result.cls).toBeGreaterThan(LIMITS.cls);
});
