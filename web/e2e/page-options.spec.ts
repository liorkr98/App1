import { expect, test } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * What the agent turns on for one page (0047, 19 Oct 2026), and the sold
 * page they keep up. Each option is off on every other page: the demo pages
 * the rest of the suite reads carry none of them.
 */

test('a flat with its options: the visit button, the open house, the video and the calculator', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/template-check/options-property/`);

  const extras = page.locator('.page-extras');
  await expect(extras).toContainText('בית פתוח');
  await expect(extras.locator('bdi').first()).toBeVisible();
  const video = extras.locator('a.page-extra-link');
  await expect(video).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\//);
  await expect(video).toHaveAttribute('target', '_blank');

  const visit = page.locator('.seller-actions a', { hasText: 'תיאום ביקור' });
  await expect(visit).toHaveAttribute('href', /\/wa\?m=visit$/);

  // The calculator: a figure at rest, and a new one when the buyer changes the rate.
  const out = page.locator('[data-loan-out] bdi');
  const first = await out.textContent();
  expect(first).toMatch(/^₪[\d,]+$/);
  await page.locator('[data-loan-rate]').fill('3');
  await expect(out).not.toHaveText(first ?? '');
  await expect(page.locator('.loan-note')).toContainText('להמחשה בלבד');
});

test('a car with its options says the warranty is the seller\'s word and offers a test drive', async ({ page }) => {
  await page.goto(`${BASE}/template-check/options-vehicle/`);
  await expect(page.locator('.page-extras')).toContainText('באחריות');
  await expect(page.locator('.page-extra-src')).toHaveText('לפי המוכר');
  await expect(page.locator('.seller-actions a', { hasText: 'תיאום נסיעת מבחן' })).toHaveCount(1);
  await expect(page.locator('#loan-title')).toHaveText('מחשבון הלוואה לרכב');
});

test('a page without options carries none of them, not even their styles or script', async ({ page }) => {
  await page.goto(`${BASE}/template-check/A7K2M/`);
  await expect(page.locator('.page-extras, .loan, [data-loan]')).toHaveCount(0);
  await expect(page.locator('.seller-actions a[href*="m=visit"]')).toHaveCount(0);
  expect(await page.content()).not.toContain('.loan-fields');
});

test('a sold page kept up shows the sale: no price, no WhatsApp, no calculator, never indexed', async ({ page }) => {
  await page.goto(`${BASE}/template-check/sold-kept/`);
  await expect(page.locator('.sold-banner')).toBeVisible();
  await expect(page.locator('.price-bar, .compact-bar, .loan')).toHaveCount(0);
  await expect(page.locator('a[href$="/wa"], a[href*="/wa?"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /נמכר$/);
});
