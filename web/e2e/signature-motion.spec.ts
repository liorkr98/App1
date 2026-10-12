import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * Round three (12 Oct 2026): four templates the owner picked from fourteen
 * sketches — Prints, Key tag, Street sign, Dashboard — ONE movement each.
 *
 * The owner asked for breathing, motion and parallax, "not all together —
 * something professional". So each of these pages runs its own signature
 * animation and nothing else of its own: no shared section rise, no photo
 * reveal, no entrance fade. Only the two pieces of page furniture every
 * listing shares stay — the compact bar that slides in once the first
 * screen is gone, and the thin reading-progress line.
 *
 * Each signature must also really move (a rule that silently stops firing
 * is worse than none), and with reduced motion nothing may run at all.
 */

const FURNITURE = ['compact-enter', 'fill'];

const DESIGNS = [
  { id: 'prints', slug: 'A7K2M', signature: ['pr-float-1', 'pr-float-2', 'pr-float-3'] },
  { id: 'keytag', slug: 'A7K2M', signature: ['kt-sway'] },
  { id: 'streetsign', slug: 'A7K2M', signature: ['ss-settle'] },
  { id: 'dashboard', slug: 'V3M9Q', signature: ['db-sweep', 'db-fill', 'db-roll'] },
] as const;

const running = (page: Page) =>
  page.evaluate(() =>
    [...new Set(document.getAnimations().map((animation) => (animation as CSSAnimation).animationName))]
      .filter(Boolean)
      .sort(),
  );

const translateOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).translate);

test.describe('one movement per design', () => {
  test.use({ viewport: PHONE, locale: 'he-IL' });

  for (const design of DESIGNS) {
    test(`${design.id}: its own movement and nothing else`, async ({ page }) => {
      await page.goto(`${BASE}/template-check/${design.slug}-${design.id}/`, { waitUntil: 'load' });
      const allowed = new Set<string>([...design.signature, ...FURNITURE]);
      for (const at of ['top', 'middle'] as const) {
        if (at === 'middle') {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
          await page.waitForTimeout(300);
        }
        const names = await running(page);
        expect(names.filter((name) => !allowed.has(name)), `extra movement at the ${at}`).toEqual([]);
        for (const name of design.signature) expect(names, `${name} at the ${at}`).toContain(name);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      ).toBeLessThanOrEqual(0);
    });
  }

  test('prints: each print drifts at its own depth', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-prints/`, { waitUntil: 'load' });
    const at = () =>
      page.locator('.pr-print').evaluateAll((els) => els.map((el) => getComputedStyle(el).translate));
    const rest = await at();
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await at()).join('|')).not.toBe(rest.join('|'));
    const moved = await at();
    expect(new Set(moved).size, 'three prints, three different depths').toBe(moved.length);
  });

  test('keytag: the tag sways about its hole, a few degrees at most', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-keytag/`, { waitUntil: 'load' });
    const turns = await page.locator('.kt-tag').evaluate((el) =>
      el.getAnimations().flatMap((animation) =>
        (animation.effect as KeyframeEffect).getKeyframes().map((frame) => parseFloat(String(frame.rotate))),
      ),
    );
    expect(turns.length).toBeGreaterThan(1);
    for (const turn of turns) expect(Math.abs(turn)).toBeLessThanOrEqual(4);
  });

  test('streetsign: the plate shows the street, never a house number, and settles', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-streetsign/`, { waitUntil: 'load' });
    const plate = page.locator('.ss-plate b');
    await expect(plate).toBeVisible();
    expect(await plate.textContent()).not.toMatch(/\d/);
    await expect
      .poll(() => page.locator('.ss-plate').evaluate((el) => getComputedStyle(el).rotate))
      .toMatch(/^(none|0deg)$/);
  });

  test('dashboard: the needle sweeps up from zero as the dash arrives', async ({ page }) => {
    await page.goto(`${BASE}/template-check/V3M9Q-dashboard/`, { waitUntil: 'load' });
    const needle = page.locator('.db-needle');
    const angle = () => needle.evaluate((el) => parseFloat(getComputedStyle(el).rotate));
    await page.locator('.db-dash').evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - window.innerHeight * 0.95));
    });
    await page.waitForTimeout(200);
    const early = await angle();
    await page.locator('.db-dash').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(angle).toBeGreaterThan(early);
    // The real number is text, isolated, and the wheels are only drawing.
    await expect(page.locator('.db-km bdi')).toHaveText(/^[\d,]+$/);
    await expect(page.locator('.db-wheels')).toHaveAttribute('aria-hidden', 'true');
  });
});

test.describe('reduced motion: all four stand still', () => {
  test.use({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });

  for (const design of DESIGNS) {
    test(`${design.id} is still`, async ({ page }) => {
      await page.goto(`${BASE}/template-check/${design.slug}-${design.id}/`, { waitUntil: 'load' });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await page.waitForTimeout(300);
      expect(await running(page)).toEqual([]);
    });
  }

  test('dashboard shows the true reading without motion', async ({ page }) => {
    await page.goto(`${BASE}/template-check/V3M9Q-dashboard/`, { waitUntil: 'load' });
    const angle = await page.locator('.db-needle').evaluate((el) => parseFloat(getComputedStyle(el).rotate));
    expect(angle).toBeGreaterThan(-90);
  });
});
