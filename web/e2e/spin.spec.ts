import { expect, test } from '@playwright/test';

/**
 * The 360 turns with a mouse, the arrow keys and its two buttons (18 Oct
 * 2026). /template-check/spin-showroom is the demo car on the showroom
 * template with four photographs as its turn — the fewest a turn built from
 * the gallery takes, so it is the crossfade-and-slide path (bindSpin).
 */
const PAGE = '/template-check/spin-showroom/';

const frame = (page: import('@playwright/test').Page) =>
  page.locator('.sr-spin img:not(.sr-spin-under)').getAttribute('src');

/**
 * Every frame loaded: bindSpin skips a frame still on its way rather than
 * show an empty box, so a turn is only predictable once a full turn round
 * the buttons visits every frame. A full turn ends where it started.
 */
async function ready(page: import('@playwright/test').Page) {
  await page.locator('[data-spin]').scrollIntoViewIfNeeded();
  const count = await page.locator('[data-spin]').evaluate((node) => (JSON.parse((node as HTMLElement).dataset.spin!) as string[]).length);
  await expect
    .poll(
      async () => {
        const seen = new Set<string | null>();
        for (let step = 0; step < count; step++) {
          await page.locator('[data-spin-step="1"]').click();
          seen.add(await frame(page));
        }
        return seen.size;
      },
      { timeout: 15_000 },
    )
    .toBe(count);
  // A retried turn may stop anywhere; start every test on the first frame.
  const first = await page.locator('[data-spin]').evaluate((node) => (JSON.parse((node as HTMLElement).dataset.spin!) as string[])[0]!);
  for (let step = 0; step < count && (await frame(page)) !== first; step++) {
    await page.locator('[data-spin-step="1"]').click();
  }
  await expect.poll(() => frame(page)).toBe(first);
}

test('the 360 turns with a mouse drag', async ({ page }) => {
  await page.goto(PAGE);
  await ready(page);
  const before = await frame(page);
  const box = (await page.locator('.sr-spin img:not(.sr-spin-under)').boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y, { steps: 4 });
  await page.mouse.move(x + 75, y, { steps: 4 });
  await page.mouse.up();
  const after = await frame(page);
  expect(after).not.toBe(before);
  // Few frames: the old one stays drawn beneath while the new one slides in.
  await expect(page.locator('.sr-spin-under')).toHaveCount(1);
});

test('the 360 turns with the arrow keys and the buttons, and comes back', async ({ page }) => {
  await page.goto(PAGE);
  await ready(page);
  const start = await frame(page);
  await page.locator('[data-spin]').focus();
  await page.keyboard.press('ArrowRight');
  const right = await frame(page);
  expect(right).not.toBe(start);
  await page.keyboard.press('ArrowLeft');
  expect(await frame(page)).toBe(start);

  await page.locator('[data-spin-step="1"]').click();
  expect(await frame(page)).toBe(right);
  await page.locator('[data-spin-step="-1"]').click();
  expect(await frame(page)).toBe(start);
  // Back past the first frame wraps round to the last.
  await page.locator('[data-spin-step="-1"]').click();
  const frames = await page.locator('[data-spin]').evaluate((node) => JSON.parse((node as HTMLElement).dataset.spin!) as string[]);
  expect(await frame(page)).toBe(frames[frames.length - 1]);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the 360 still turns, with no fade beneath', async ({ page }) => {
    await page.goto(PAGE);
    await ready(page);
    await expect(page.locator('.sr-spin-under')).toHaveCount(0);
    const start = await frame(page);
    await page.locator('[data-spin]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await frame(page)).not.toBe(start);
  });
});
