import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * Round three (12 Oct 2026): four templates, ONE movement each.
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
  { id: 'breath', slug: 'A7K2M', signature: ['br-breathe'] },
  { id: 'chapters', slug: 'A7K2M', signature: ['ch-open', 'ch-caption'] },
  { id: 'depth', slug: 'A7K2M', signature: ['dp-fall', 'dp-rise', 'dp-window'] },
  { id: 'road', slug: 'V3M9Q', signature: ['rd-drive'] },
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

  test('breath: the photograph starts as framed and breathes by 4% at most', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-breath/`, { waitUntil: 'load' });
    const keyframes = await page.locator('.br-img').evaluate((el) =>
      el.getAnimations().flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes().map((frame) => frame.scale)),
    );
    expect(keyframes[0]).toBe('1');
    expect(Math.max(...keyframes.map(Number))).toBeLessThanOrEqual(1.04);
  });

  test('depth: the photograph falls behind as the page scrolls', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-depth/`, { waitUntil: 'load' });
    const rest = await translateOf(page, '.dp-img');
    expect(rest).toMatch(/^(none|0px( 0(px|%))?)$/);
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => translateOf(page, '.dp-img')).not.toBe(rest);
  });

  test('chapters: a chapter opens as it reaches the screen', async ({ page }) => {
    await page.goto(`${BASE}/template-check/A7K2M-chapters/`, { waitUntil: 'load' });
    const figure = page.locator('#listing-gallery .gallery-open img').nth(1);
    // Open is inset(0 …): every offset before "round" is zero, however the
    // browser writes it ("inset(0px 0px 0px 0% round 2px)").
    const open = () =>
      figure.evaluate((el) => {
        const inset = /inset\(([^)]*?)(?: round [^)]*)?\)/.exec(getComputedStyle(el).clipPath)?.[1] ?? '';
        return inset.split(/\s+/).every((part) => parseFloat(part) === 0);
      });
    // Just entering at the bottom of the screen: partly covered.
    await figure.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - window.innerHeight + 40);
    });
    await expect.poll(open).toBe(false);
    // Well inside the screen: open.
    await figure.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(open).toBe(true);
  });

  test('road: the strip drives sideways as the page scrolls past it', async ({ page }) => {
    await page.goto(`${BASE}/template-check/V3M9Q-road/`, { waitUntil: 'load' });
    const strip = '#listing-gallery.gallery, #listing-gallery .gallery';
    // Just arrived (its foot at the foot of the screen), then nearly gone
    // (its head at the head): two points well inside its driving range.
    await page.locator(strip).first().evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(200);
    const early = await translateOf(page, strip);
    await page.locator(strip).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect.poll(() => translateOf(page, strip)).not.toBe(early);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      'the strip never makes the page scroll sideways',
    ).toBeLessThanOrEqual(0);
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

  test('road is a strip a finger swipes instead', async ({ page }) => {
    await page.goto(`${BASE}/template-check/V3M9Q-road/`, { waitUntil: 'load' });
    const strip = page.locator('#listing-gallery.gallery, #listing-gallery .gallery').first();
    expect(await strip.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});
