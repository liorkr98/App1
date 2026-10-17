import { expect, test } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * The homepage's moving parts (16–17 Oct 2026): the header's account link
 * read from storage instead of the 210 KB Supabase client, the scroll story,
 * the before-and-after comparison, and the testimonials that stay away until
 * a real one exists.
 */

const SESSION_KEY = 'sb-yaaqcfcjkfdwtczespny-auth-token';

test('the header knows a signed-in browser without loading the Supabase client', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });

  await page.goto(`${BASE}/`);
  await expect(page.locator('#nav-enter')).toBeVisible();
  await expect(page.locator('#nav-mine')).toBeHidden();

  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ refresh_token: 'r', access_token: 'a' })), SESSION_KEY);
  await page.reload();
  await expect(page.locator('#nav-mine')).toBeVisible();
  await expect(page.locator('#nav-enter')).toBeHidden();
  expect(await page.evaluate(() => document.cookie)).toContain('=1');

  expect(scripts.filter((url) => /supabase\.[\w-]+\.js$/.test(url)), 'the Supabase client on the homepage').toEqual([]);
});

test('a sign-in that lands on the homepage is finished on /enter/', async ({ page }) => {
  await page.route('**/enter/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>enter</p>' }));
  await page.goto(`${BASE}/#access_token=abc&refresh_token=def`);
  await page.waitForURL(/\/enter\/#access_token=abc/);
});

test('the comparison follows its slider, by keyboard too', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/`);
  const compare = page.locator('[data-compare]');
  const range = compare.locator('.hm-compare-range');
  await range.scrollIntoViewIfNeeded();
  await expect(range).toHaveAccessibleName(/להשוות/);

  await range.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowDown');
  const split = await compare.evaluate((node) => (node as HTMLElement).style.getPropertyValue('--split'));
  expect(split).toBe('45%');
  const clip = await compare.locator('.hm-chat-after').evaluate((node) => getComputedStyle(node).clipPath);
  expect(clip).toContain('45%');
});

test('the story phone shows the step being read', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`${BASE}/`);
  const phone = page.locator('[data-story-phone]');
  for (const n of ['1', '2', '3', '4']) {
    await page.locator(`[data-story-step="${n}"]`).evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await expect(phone).toHaveAttribute('data-step', n);
  }
});

test('no testimonials section until a real, consented one exists', async ({ page }) => {
  await page.goto(`${BASE}/`);
  await expect(page.locator('#hm-voices-title')).toHaveCount(0);
});
