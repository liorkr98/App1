import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';
import { TEMPLATE_PAGES } from './pages';

/**
 * Text below the first screen is readable on every template.
 *
 * Found 6 Oct 2026: the neighbourhood section is dark in the base sheet,
 * and six paper templates painted it light without changing its ink, so
 * the place names and the heading were near-white on near-white (1.0:1).
 * No file-level gate could see it — the colours came from two sheets — so it
 * is measured where the buyer sees it, in the rendered page.
 *
 * WCAG AA body text, 4.5:1, against the nearest painted background.
 */
const MIN = 4.5;

const CHECKED = [
  '.enrich h2',
  '.enrich .egroup-head h3',
  '.enrich .who b',
  '.enrich .who em',
  '.enrich-sub',
  '.enrich .source',
  '.facts dt',
  '.facts dd',
  '.about p',
  '.map-nav',
  '.map-nearby-walk',
  '.area-map-walk',
  '.cta',
].join(', ');

/** Every checked text below MIN, by class and ratio. */
async function lowContrast(tab: Page): Promise<string[]> {
  return tab.evaluate(
        ({ selector, min }) => {
          // Any CSS colour — rgb(), color(srgb …), oklab() from color-mix() —
          // through a 1×1 canvas, which hands back plain sRGB bytes.
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const ink = canvas.getContext('2d', { willReadFrequently: true })!;
          const parse = (value: string): number[] => {
            ink.clearRect(0, 0, 1, 1);
            ink.fillStyle = '#000';
            ink.fillStyle = value;
            ink.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data;
            return [r!, g!, b!, a! / 255];
          };
          const luminance = ([r, g, b]: number[]) => {
            const channel = (v: number) => {
              const c = v / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
          };
          const background = (element: Element): number[] => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              const value = parse(getComputedStyle(node).backgroundColor);
              if (value[3]! > 0.5) return value;
            }
            return [255, 255, 255];
          };
          const out: string[] = [];
          for (const element of document.querySelectorAll(selector)) {
            if (!element.textContent?.trim()) continue;
            const a = luminance(parse(getComputedStyle(element).color));
            const b = luminance(background(element));
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < min) out.push(`${element.className || element.tagName} "${element.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)}:1`);
          }
          return [...new Set(out)];
        },
        { selector: CHECKED, min: MIN },
      );
}

test.describe('readable text on every template', () => {
  for (const page of TEMPLATE_PAGES) {
    test(page.name, async ({ browser }) => {
      const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
      const tab = await context.newPage();
      await tab.goto(`${BASE}${page.path}`, { waitUntil: 'load' });

      const failures = await lowContrast(tab);

      await context.close();
      expect(failures, `${page.name}: text below ${MIN}:1`).toEqual([]);
    });
  }
});

// Heliograph turns its palette at dusk (bindHeliograph puts .hl-night on
// <html>); the night palette is checked as a page of its own.
test('heliograph after dusk', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const tab = await context.newPage();
  await tab.goto(`${BASE}/template-check/T4V7A-heliograph/`, { waitUntil: 'load' });
  // As bindHeliograph leaves it after dusk: the night class and the dark sky.
  await tab.evaluate(() => {
    document.documentElement.classList.add('hl-night');
    document.documentElement.style.setProperty('--hl-sky', 'rgb(14, 18, 36)');
  });
  // The page fades into its night colours over 0.6 s (heliograph.css).
  await tab.waitForTimeout(900);
  const failures = await lowContrast(tab);
  await context.close();
  expect(failures, 'heliograph at night: text below 4.5:1').toEqual([]);
});

// A rule that silently stops firing is worse than no rule (CLAUDE.md §4.1).
test('the contrast check fires on near-white text on paper', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const tab = await context.newPage();
  await tab.goto(`${BASE}/template-check/T4V7A-heliograph/`, { waitUntil: 'load' });
  await tab.addStyleTag({ content: '.enrich h2 { color: #fbfaf7 !important; }' });
  const failures = await lowContrast(tab);
  await context.close();
  expect(failures.length).toBeGreaterThan(0);
});
