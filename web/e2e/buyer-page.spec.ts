import { expect, test } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * What a buyer touches on a listing page (17 Oct 2026): the WhatsApp bar that
 * folds to a round button while they read and opens again at the end, and
 * the photo viewer's room chips and swipe-down close.
 */
const PAGE = `${BASE}/template-check/T4V7A-aurora/`;

const scrollToFraction = (fraction: number) => {
  const top = (document.documentElement.scrollHeight - innerHeight) * fraction;
  window.scrollTo({ top, behavior: 'instant' });
};

test('the WhatsApp bar folds while reading and opens again at the end', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(PAGE);
  const dock = page.locator('.cta-dock');
  const fold = () => dock.evaluate((node) => Number(getComputedStyle(node).getPropertyValue('--fold')));

  expect(await fold()).toBe(0);
  await page.evaluate(scrollToFraction, 0.5);
  await expect.poll(fold).toBe(1);
  // Folded, it is still the same link with the same name, and still tappable.
  await expect(dock.locator('a.cta')).toHaveAccessibleName(/וואטסאפ/);
  await expect(dock.locator('a.cta')).toHaveAttribute('href', /\/wa\?text=/);
  await page.evaluate(scrollToFraction, 1);
  await expect.poll(fold).toBe(0);
});

test('a reader who asked for less motion keeps the full bar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(PAGE);
  await page.evaluate(scrollToFraction, 0.5);
  await page.waitForTimeout(200);
  expect(await page.locator('.cta-label').evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  await context.close();
});

test('the photo viewer has a chip per room that jumps to it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(PAGE);
  await page.locator('.gallery-open').first().click();
  const viewer = page.locator('#listing-lightbox');
  await expect(viewer).toHaveJSProperty('open', true);
  await expect(viewer.locator('.lightbox-chip')).toHaveText(['סלון', 'מטבח', 'מרפסת', 'חדר רחצה']);

  await viewer.locator('.lightbox-chip', { hasText: 'מרפסת' }).click();
  await expect(viewer.locator('[data-lightbox-room]')).toHaveText('מרפסת');
});

test('a swipe down closes the photo viewer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(PAGE);
  await page.locator('.gallery-open').first().tap();
  const viewer = page.locator('#listing-lightbox');
  await expect(viewer).toHaveJSProperty('open', true);
  await page.waitForTimeout(400);

  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x: 195, y }] });
  await touch('touchStart', 380);
  for (let step = 1; step <= 10; step += 1) await touch('touchMove', 380 + step * 20);
  await touch('touchEnd');
  await expect(viewer).toHaveJSProperty('open', false);
  await context.close();
});
