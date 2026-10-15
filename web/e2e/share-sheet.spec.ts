import { expect, test } from '@playwright/test';

/**
 * The share sheet (lib/share-sheet.ts) on its CI fixture, which hands it the
 * same data /a/{slug}/message.json would. Paper is how it opens in the
 * editor, Onyx in the dashboard.
 */
for (const ls of ['paper', 'onyx']) {
  test(`the sheet offers WhatsApp, Facebook and the link (${ls})`, async ({ page }) => {
    await page.goto(`/template-check/share-sheet/${ls}/`);
    await page.click('#open');
    const sheet = page.locator('dialog.ss[open]');
    await expect(sheet).toBeVisible();

    const message = await sheet.locator('.ss-text').innerText();
    expect(message).toContain('https://amudsell.com/a/T4V7A/');

    // WhatsApp gets the whole message; Facebook gets the link (it takes no text).
    const wa = new URL((await sheet.locator('a.ss-whatsapp').getAttribute('href')) ?? '');
    expect(wa.host).toBe('wa.me');
    expect(wa.searchParams.get('text')).toContain('https://amudsell.com/a/T4V7A/');
    const fb = new URL((await sheet.locator('a.ss-facebook').getAttribute('href')) ?? '');
    expect(fb.host).toBe('www.facebook.com');
    expect(fb.searchParams.get('u')).toBe('https://amudsell.com/a/T4V7A/');

    // Every number in the preview is isolated (CLAUDE.md §4.2).
    const bare = await sheet.locator('.ss-text').evaluate((node) =>
      [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && /\d/.test(child.textContent ?? '')).length,
    );
    expect(bare).toBe(0);

    await expect(sheet.locator('.ss-kit')).toHaveAttribute('href', '/a/T4V7A/share/');
  });
}

test('Facebook copies the message on the way out and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/template-check/share-sheet/paper/');
  await page.click('#open');
  // Keep the tap on this page: the test is about what happens before leaving.
  await page.locator('a.ss-facebook').evaluate((link) => link.addEventListener('click', (event) => event.preventDefault()));
  await page.locator('a.ss-facebook').click();
  await expect(page.locator('.ss-said')).toHaveText(/הועתקה/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('https://amudsell.com/a/T4V7A/');
});

test('copy link puts the link on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/template-check/share-sheet/onyx/');
  await page.click('#open');
  await page.locator('button.ss-copy').click();
  await expect(page.locator('.ss-said')).toHaveText(/הועתק/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://amudsell.com/a/T4V7A/');
});

test('Escape, the close button and the backdrop each close it', async ({ page }) => {
  await page.goto('/template-check/share-sheet/paper/');

  await page.click('#open');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.ss')).toHaveCount(0);

  await page.click('#open');
  await page.locator('.ss-close').click();
  await expect(page.locator('dialog.ss')).toHaveCount(0);

  await page.click('#open');
  await page.mouse.click(5, 5);
  await expect(page.locator('dialog.ss')).toHaveCount(0);
});

test('it fits a phone, every target at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/template-check/share-sheet/onyx/');
  await page.click('#open');
  const sheet = page.locator('dialog.ss[open]');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(360);
  for (const target of await sheet.locator('.ss-tile, .ss-close').all()) {
    const size = await target.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(44);
    expect(size?.height).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
