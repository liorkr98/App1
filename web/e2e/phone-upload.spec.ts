import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * Upload from your phone — the page the editor's QR opens (pages/up.astro).
 *
 * The static server has no /api, so the route is answered here. What is
 * checked is what the phone does: it refuses a bad or expired code, and what
 * it sends is a WebP with no EXIF — the GPS of a photograph taken inside
 * somebody's home must not leave the phone (CLAUDE.md §9).
 */

const TOKEN = 'ab'.repeat(32);
const MARK = 'GPSMARK-32.0566-34.7701';

/** A JPEG as a phone takes it: an EXIF segment carrying a location marker. */
async function phonePhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c9b48f';
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = '#3d5a40';
    context.fillRect(200, 150, 500, 400);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  const jpeg = Buffer.from(base64, 'base64');
  // APP1 "Exif\0\0" + a little-endian TIFF header with no entries, then the marker.
  const payload = Buffer.concat([
    Buffer.from('Exif\0\0', 'binary'),
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from(MARK, 'ascii'),
  ]);
  const length = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test.describe('upload from your phone', () => {
  test.use({ viewport: PHONE, locale: 'he-IL' });

  test('a code that is not a code is refused before anything is asked', async ({ page }) => {
    let asked = false;
    await page.route('**/api/phone-upload**', (route) => {
      asked = true;
      return route.fulfill({ status: 500 });
    });
    await page.goto(`${BASE}/up/#not-a-token`);
    await expect(page.locator('#status')).toHaveText(/הקוד לא מוכר/);
    await expect(page.locator('#actions')).toBeHidden();
    expect(asked).toBe(false);
  });

  test('an expired code says so and offers no buttons', async ({ page }) => {
    await page.route('**/api/phone-upload**', (route) =>
      route.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"expired"}' }),
    );
    await page.goto(`${BASE}/up/#${TOKEN}`);
    await expect(page.locator('#status')).toHaveText(/הקוד פג/);
    await expect(page.locator('#actions')).toBeHidden();
  });

  test('a photo goes out as a WebP with no EXIF, and the count is isolated', async ({ page }) => {
    const sent: Buffer[] = [];
    await page.route('**/api/phone-upload**', async (route) => {
      const request = route.request();
      expect(request.headers()['x-portal-token']).toBe(TOKEN);
      if (request.method() === 'GET') {
        return route.fulfill({ contentType: 'application/json', body: '{"ok":true,"sent":0,"remaining":25}' });
      }
      expect(new URL(request.url()).searchParams.get('w')).toMatch(/^\d+$/);
      sent.push(request.postDataBuffer()!);
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, sent: sent.length, remaining: 25 - sent.length }),
      });
    });

    await page.goto(`${BASE}/up/#${TOKEN}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#actions')).toBeVisible();

    const photo = await phonePhoto(page);
    expect(photo.includes(Buffer.from(MARK)), 'the fixture carries its marker').toBe(true);
    await page.locator('#gallery').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: photo });

    await expect(page.locator('#status')).toContainText('נשלחו');
    await expect(page.locator('#status bdi')).toHaveText('1');
    await expect(page.locator('#shots li.is-sent')).toHaveCount(1);

    expect(sent).toHaveLength(1);
    const body = sent[0]!;
    expect(body.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(body.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(body.includes(Buffer.from('EXIF')), 'an EXIF chunk reached the server').toBe(false);
    expect(body.includes(Buffer.from(MARK)), 'the location marker reached the server').toBe(false);
  });

  test('no sideways scroll on a phone', async ({ page }) => {
    await page.route('**/api/phone-upload**', (route) =>
      route.fulfill({ contentType: 'application/json', body: '{"ok":true,"sent":3,"remaining":22}' }),
    );
    await page.goto(`${BASE}/up/#${TOKEN}`);
    await expect(page.locator('#actions')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
