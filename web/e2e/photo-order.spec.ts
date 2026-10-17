import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * Picking a photo up and putting it somewhere else (PhotosStep,
 * usePhysicalOrder), with a mouse and with a finger.
 *
 * CLAUDE.md §4.4: in RTL the first photo is the RIGHTMOST, and it is the
 * cover. Each test drags the fourth photo onto the first and asserts both
 * that it became index 0 and that index 0 is drawn on the right.
 */

const NAMES = ['a-salon.jpg', 'b-kitchen.jpg', 'c-bedroom.jpg', 'd-balcony.jpg'];

async function addFour(page: Page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto(`${BASE}/new/?fresh=1`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'דירה' }).click();
  const files = await page.evaluate(async (names) => {
    const out: string[] = [];
    for (const [index] of names.entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const context = canvas.getContext('2d')!;
      context.fillStyle = ['#c9b48f', '#8fa9c9', '#a9c98f', '#c98fa9'][index]!;
      context.fillRect(0, 0, 800, 600);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      out.push(btoa(binary));
    }
    return out;
  }, NAMES);
  await page.locator('.picker input[type=file]').setInputFiles(
    NAMES.map((name, index) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(files[index]!, 'base64') })),
  );
  await expect(page.locator('.strip li')).toHaveCount(4);
  await inView(page);
}

/**
 * Where an agent would see the photos: in the middle of the screen, clear of
 * the editor's fixed bottom bar, and done arriving. Right after the upload
 * the fourth photo can still be below the fold or under that bar, and the
 * strip is still settling from its entrance (about 10 px), so a press aimed
 * at a position measured then can land on the bar or on nothing. That made
 * this test fail one run in two once the first-listing hint grew taller
 * (17 Oct 2026); dragging itself was never broken.
 */
async function inView(page: Page) {
  await page.locator('.strip').evaluate((strip) => strip.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const top = () => page.locator('.strip > li img').nth(3).evaluate((img) => img.getBoundingClientRect().top);
  let last = await top();
  await expect
    .poll(async () => {
      await page.waitForTimeout(120);
      const now = await top();
      const still = Math.abs(now - last) < 0.5;
      last = now;
      return still;
    })
    .toBe(true);
  const hit = await page.locator('.strip > li img').nth(3).evaluate((img) => {
    const box = img.getBoundingClientRect();
    return img.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  });
  expect(hit, 'the fourth photo is what a press at its centre lands on').toBe(true);
}

const order = (page: Page) =>
  page.locator('.strip > li').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.id?.split(':')[0]));

async function centre(page: Page, index: number) {
  const box = await page.locator('.strip > li img').nth(index).boundingBox();
  if (!box) throw new Error(`no photo ${index}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function coverIsRightmost(page: Page) {
  const [first, second] = await Promise.all([
    page.locator('.strip > li').nth(0).boundingBox(),
    page.locator('.strip > li').nth(1).boundingBox(),
  ]);
  expect(first!.x).toBeGreaterThan(second!.x);
  await expect(page.locator('.strip > li').nth(0).locator('.cover')).toBeVisible();
}

test('a mouse picks the fourth photo up and makes it the cover', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
  const page = await context.newPage();
  await addFour(page);

  const from = await centre(page, 3);
  const to = await centre(page, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y, { steps: 2 });
  await expect(page.locator('.strip > li.lifted')).toHaveCount(1);
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();

  await expect(page.locator('.strip > li.lifted')).toHaveCount(0);
  expect(await order(page)).toEqual(['d-balcony.jpg', 'a-salon.jpg', 'b-kitchen.jpg', 'c-bedroom.jpg']);
  await coverIsRightmost(page);
  // Nothing is left displaced once it has settled.
  await page.waitForTimeout(400);
  expect(await page.locator('.strip > li').nth(0).evaluate((li) => (li as HTMLElement).style.transform)).toBe('');
  await context.close();
});

test('a finger holds, lifts, and moves the photo; a quick swipe only scrolls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await addFour(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [],
    });

  // A swipe that moves before the hold is up is a scroll: nothing lifts.
  let from = await centre(page, 3);
  await touch('touchStart', from);
  for (let step = 1; step <= 6; step += 1) await touch('touchMove', { x: from.x, y: from.y - step * 12 });
  await touch('touchEnd');
  await expect(page.locator('.strip > li.lifted')).toHaveCount(0);
  expect(await order(page)).toEqual(NAMES);
  // Let the swipe's fling finish: Chrome treats a touch that lands during a
  // fling as passive, and so would a real phone.
  await page.waitForTimeout(800);
  await inView(page);

  // A hold lifts it, and then it follows the finger.
  from = await centre(page, 3);
  const to = await centre(page, 0);
  await touch('touchStart', from);
  await page.waitForTimeout(450);
  await expect(page.locator('.strip > li.lifted')).toHaveCount(1);
  for (let step = 1; step <= 16; step += 1) {
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * step) / 16,
      y: from.y + ((to.y - from.y) * step) / 16,
    });
  }
  await touch('touchEnd');

  await expect(page.locator('.strip > li.lifted')).toHaveCount(0);
  expect(await order(page)).toEqual(['d-balcony.jpg', 'a-salon.jpg', 'b-kitchen.jpg', 'c-bedroom.jpg']);
  await coverIsRightmost(page);
  await context.close();
});

test('the move buttons still reorder, without a pointer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await addFour(page);
  await page.locator('.strip > li').nth(1).locator('.shot-move').first().click();
  expect(await order(page)).toEqual(['b-kitchen.jpg', 'a-salon.jpg', 'c-bedroom.jpg', 'd-balcony.jpg']);
  await coverIsRightmost(page);
  await context.close();
});
