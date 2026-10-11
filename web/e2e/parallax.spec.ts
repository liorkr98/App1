import { expect, test } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * The cover photograph moves slower than the page (stage.css, "Parallax on
 * the cover photograph", 11 Oct 2026).
 *
 * Checked by what a buyer would see: the photograph's own offset and zoom
 * change as the page scrolls, it starts exactly as the agent framed it, its
 * frame still clips it (no edge shows), and none of it happens for someone
 * who asked their phone for less motion.
 */
const COVERS: { id: string; slug: string; img: string; frame: string }[] = [
  { id: 'aurora', slug: 'T4V7A', img: '.cine-img', frame: '.cine-frame' },
  { id: 'atelier', slug: 'T4V7A', img: '.at-photo img', frame: '.at-photo' },
  { id: 'heliograph', slug: 'T4V7A', img: '.hl-photo img', frame: '.hl-photo' },
  { id: 'monolith', slug: 'T4V7A', img: '.mono-img', frame: '.mono-wipe' },
  { id: 'walk', slug: 'T4V7A', img: '.wk-cover img', frame: '.wk-cover' },
  { id: 'glass', slug: 'T4V7A', img: '.gl-shot img', frame: '.gl-shot' },
  { id: 'dossier', slug: 'G7F2K', img: '.ds-photo img', frame: '.ds-photo' },
];

/** `none`, `0px`, `0px 0%`: however the browser spells "not moved". */
const atRest = (value: string) => value === 'none' || value.split(/\s+/).every((part) => parseFloat(part) === 0);

const state = (img: string) => (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const style = getComputedStyle(el);
  return { translate: style.translate, scale: style.scale };
};

for (const { id, slug, img, frame } of COVERS) {
  test(`${id}: the cover drifts as the page scrolls, inside its frame`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(`${BASE}/template-check/${slug}-${id}/`, { waitUntil: 'load' });

    const top = await page.evaluate(state(img), img);
    expect(top, `${id}: no cover found`).not.toBeNull();
    // At rest: as the agent framed it.
    expect(atRest(top!.translate), `${id}: the cover starts moved (${top!.translate})`).toBe(true);

    const box = await page.locator(frame).first().boundingBox();
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((box!.y + box!.height) * 0.6));
    await page.waitForTimeout(250);
    const moved = await page.evaluate(state(img), img);
    expect(moved!.translate, `${id}: the cover did not move`).not.toBe(top!.translate);
    expect(moved!.scale, `${id}: the cover did not open up`).not.toBe(top!.scale);

    const clips = await page.evaluate((selector) => {
      const el = document.querySelector<HTMLElement>(selector);
      return el ? getComputedStyle(el).overflow : '';
    }, frame);
    expect(clips, `${id}: the frame does not clip the moving photo`).toContain('clip');
    await context.close();
  });
}

test('no parallax for someone who asked for less motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/template-check/T4V7A-aurora/`, { waitUntil: 'load' });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(250);
  const after = await page.evaluate(state('.cine-img'), '.cine-img');
  expect(atRest(after!.translate), `moved under reduced motion (${after!.translate})`).toBe(true);
  await context.close();
});
