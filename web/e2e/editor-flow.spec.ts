import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * The new-listing flow stays simple (11 Oct 2026).
 *
 * The owner's words: agents are not technical, creating a listing must be
 * super simple. These are the parts of that which a test can hold:
 *
 *   - four screens, in this order, and the agent moves through them with
 *     one big button that is never greyed out
 *   - the first screen asks one question and shows no warnings
 *   - nothing to tap is smaller than a finger (48px), and nothing scrolls
 *     sideways on a phone
 *   - the counter's numbers are isolated from the Hebrew (CLAUDE.md §4.2)
 *
 * Signed out, with the database unreachable: the flow must still walk.
 */

async function photo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c9b48f';
    context.fillRect(0, 0, 1600, 1200);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.editor :is(button, summary, label.picker, a.missing-fix)')]
      .filter((el) => el.checkVisibility() && !el.closest('.strip'))
      .filter((el) => el.getBoundingClientRect().height < 48)
      .map((el) => `${(el.textContent ?? '').trim().slice(0, 24)} (${Math.round(el.getBoundingClientRect().height)}px)`),
  );
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('four screens, one big button, nothing greyed out', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?fresh=1`, { waitUntil: 'load' });

  // Screen 1: one question, no warnings, the counter isolated.
  await expect(page.locator('.flow-title')).toHaveText('התמונות');
  await expect(page.locator('.flow-count bdi')).toHaveText(['1', '4']);
  await expect(page.locator('.kind-choice')).toHaveCount(2);
  await expect(page.locator('.blockers, .missing, .publish-failure')).toHaveCount(0);
  await expect(page.locator('.nav-next')).toBeEnabled();
  expect(await smallTargets(page), 'tap targets on the first screen').toEqual([]);

  await page.getByRole('button', { name: 'דירה' }).click();
  await page.locator('.picker input[type=file]').setInputFiles({
    name: 'salon.jpg',
    mimeType: 'image/jpeg',
    buffer: await photo(page),
  });
  await expect(page.locator('.strip li')).toHaveCount(1);
  expect(await sideways(page)).toBeLessThanOrEqual(0);

  // Screen 2: the details. Next is never disabled, even with nothing typed.
  await page.locator('.nav-next').click();
  await expect(page.locator('.flow-title')).toHaveText('הפרטים');
  await expect(page.locator('.nav-next')).toBeEnabled();
  await expect(page.locator('details.more')).not.toHaveAttribute('open', '');
  await page.locator('#d-city').fill('חולון');
  await page.locator('#fact-rooms').fill('4');
  expect(await smallTargets(page), 'tap targets on the details screen').toEqual([]);
  expect(await sideways(page)).toBeLessThanOrEqual(0);

  // Screen 3: the text arrives written, the design is chosen.
  await page.locator('.nav-next').click();
  await expect(page.locator('.flow-title')).toHaveText('המודעה מוכנה');
  await expect(page.locator('textarea').first()).not.toHaveValue('');
  await expect(page.locator('.ready-design')).toContainText('בחרנו בשבילכם');

  // Screen 4: what is missing, said in words, each with a way to fix it.
  await page.locator('.nav-next').click();
  await expect(page.locator('.flow-title')).toHaveText('פרסום');
  await expect(page.locator('.nav-next')).toHaveCount(0);
  await expect(page.locator('.missing li').first()).toBeVisible();
  // The title wrote itself from the facts: "דירת 4 חדרים בחולון".
  await expect(page.locator('.missing')).not.toContainText('כותרת');
  expect(await smallTargets(page), 'tap targets on the publish screen').toEqual([]);
  expect(await sideways(page)).toBeLessThanOrEqual(0);

  // "Fix" takes the agent back to the screen that holds the gap.
  await page.locator('.missing-fix').first().click();
  await expect(page.locator('.flow-title')).not.toHaveText('פרסום');
  await context.close();
});

/**
 * WCAG contrast of the element's text against what is actually behind it: a
 * see-through background is laid over its ancestors' (the 12 Oct bug was a
 * 5%-opaque fill, which reads as "dark" if the alpha is ignored).
 */
async function buttonContrast(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => {
    const rgba = (value: string) => {
      const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
      return { c: parts.slice(0, 3), a: parts.length > 3 ? parts[3]! : 1 };
    };
    const layers: { c: number[]; a: number }[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);
      if (layer.a > 0) layers.push(layer);
      if (layer.a >= 1) break;
    }
    let back = [255, 255, 255];
    for (const layer of layers.reverse()) back = back.map((v, i) => layer.c[i]! * layer.a + v * (1 - layer.a));
    const lum = (rgb: number[]) => {
      const [R, G, B] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
    };
    const a = lum(rgba(getComputedStyle(el).color).c);
    const b = lum(back);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test('"next" stays dark under a finger on the first screen', async ({ browser }) => {
  // 12 Oct: on screen 1 there is no Back button, so "next" was the nav's
  // first child, and the Back button's old hover rule (written as
  // :first-child) painted it pale under its white text once tapped.
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?fresh=1`, { waitUntil: 'load' });
  await expect(page.locator('.flow-title')).toHaveText('התמונות');
  await expect(page.locator('.nav-back')).toHaveCount(0);

  expect(await buttonContrast(page, '.nav-next'), 'at rest').toBeGreaterThanOrEqual(4.5);
  await page.locator('.nav-next').hover();
  await page.waitForTimeout(400); // past the background transition
  expect(await buttonContrast(page, '.nav-next'), 'hovered (a phone keeps this after a tap)').toBeGreaterThanOrEqual(4.5);
  await context.close();
});
