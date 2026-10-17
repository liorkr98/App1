import { expect, test } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * The hints on an agent's first listing (Coach.tsx, 17 Oct 2026): one line
 * and a ring on the thing to tap, gone for good once dismissed, never on a
 * listing opened for editing, and none after the first publish.
 */
test('a new listing opens with a hint, and a dismissed hint stays gone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?fresh=1`);
  await expect(page.locator('.coach')).toContainText('דירה או רכב');
  // The ring is on the pair: on one card it would read as advice to pick it.
  await expect(page.locator('.kind-choices.coach-target')).toHaveCount(1);
  await expect(page.locator('.kind-choice.coach-target')).toHaveCount(0);

  await page.getByRole('button', { name: 'דירה' }).click();
  await expect(page.locator('.coach')).toContainText('התמונות');
  await page.locator('.coach-ok').click();
  await expect(page.locator('.coach')).toHaveCount(0);
  await expect(page.locator('.coach-target')).toHaveCount(0);

  // The next listing, opened the way an agent opens one (מודעה חדשה).
  await page.goto(`${BASE}/new/?fresh=1`);
  await page.getByRole('button', { name: 'דירה' }).click();
  await expect(page.locator('.coach')).toHaveCount(0);
});

test('no hints on a listing opened for editing, or after the first publish', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?id=T4V7A`);
  await page.waitForTimeout(500);
  await expect(page.locator('.coach')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('amudsell.coach', JSON.stringify({ done: true })));
  await page.goto(`${BASE}/new/?fresh=1`);
  await page.waitForTimeout(500);
  await expect(page.locator('.coach')).toHaveCount(0);
});

test('one tap turns every hint off', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?fresh=1`);
  await page.getByRole('button', { name: 'בלי טיפים' }).click();
  await expect(page.locator('.coach')).toHaveCount(0);
  await expect(page.locator('.coach-target')).toHaveCount(0);

  // The next step would have had its own hint.
  await page.getByRole('button', { name: 'דירה' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('.coach')).toHaveCount(0);
});
