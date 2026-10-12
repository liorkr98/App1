import { expect, test } from '@playwright/test';

import { CATALOGUE, templateFits } from '@/features/templates/manifest';

import { BASE, PHONE } from './measure';

/**
 * Every template looks like itself on a REAL listing (7 Oct 2026).
 *
 * The demo fixtures carry verified enrichment, labelled rooms and a floor
 * plan; listings from the editor carry none of that. On a real listing Walk
 * lost its route and Blueprint its plan, and both rendered as photo, title,
 * price — the plain layout an agent then reported as "looks the same as the
 * regular ones". Nothing caught it, because nothing looked at real-shaped
 * data. These pages are (web/src/lib/real-shaped.ts):
 *
 *   R4LSH  a flat with the neighbourhood /api/area stores, nothing else
 *   R4LB0  the same flat before (or without) that lookup
 *   R4LCR  a car with the seller's answers only, no register data
 *
 * Each template must show its own signature in its first screen.
 */
const SIGNATURE: Record<string, string> = {
  aurora: '.cine-panel',
  heliograph: '.hl-sky',
  walk: '.wk-teaser',
  blueprint: '.bp-sheet, .bp-plan',
  monolith: '.mono-giant',
  atelier: '.at-mast',
  glass: '.gl-card',
  poster: '.po-giant',
  zine: '.zn-cover',
  ticket: '.tk-qr',
  showroom: '.sr-platform',
  dossier: '.ds-folder',
  prints: '.pr-table',
  keytag: '.kt-tag',
  streetsign: '.ss-plate',
  dashboard: '.db-dash',
};

const LISTINGS = [
  { slug: 'R4LSH', category: 'property' as const },
  { slug: 'R4LB0', category: 'property' as const },
  { slug: 'R4LCR', category: 'vehicle' as const },
];

const PAGES = LISTINGS.flatMap(({ slug, category }) =>
  CATALOGUE.filter((id) => templateFits(id, category)).map((id) => ({ id, slug })),
);

test.describe('each template keeps its signature on real-shaped data', () => {
  for (const { id, slug } of PAGES) {
    test(`${slug}-${id}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
      const tab = await context.newPage();
      await tab.goto(`${BASE}/template-check/${slug}-${id}/`, { waitUntil: 'load' });

      const selector = SIGNATURE[id];
      expect(selector, `no signature recorded for ${id}`).toBeTruthy();
      const signature = tab.locator(selector!).first();
      await expect(signature, `${id}: its signature is missing`).toBeVisible();
      const box = await signature.boundingBox();
      expect(box?.y ?? Infinity, `${id}: its signature is below the first screen`).toBeLessThan(PHONE.height * 1.2);

      await context.close();
    });
  }
});

test.describe('the street, never the building', () => {
  for (const { id, slug } of PAGES) {
    test(`${slug}-${id}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
      const tab = await context.newPage();
      await tab.goto(`${BASE}/template-check/${slug}-${id}/`, { waitUntil: 'load' });
      const html = await tab.content();
      // The old drawn card's teardrop pin (map-card.ts, removed 7 Oct 2026).
      expect(html.includes('M400 148c-28'), `${id}: a location pin is drawn`).toBe(false);
      // The fixture's street with any house number after it.
      expect(/הקישון\s*\d/.test(html), `${id}: a house number is shown`).toBe(false);
      await context.close();
    });
  }
});

// A check that can no longer fail is worse than none (CLAUDE.md §4.1).
test('the signature check fires when a template loses its signature', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const tab = await context.newPage();
  await tab.goto(`${BASE}/template-check/R4LB0-walk/`, { waitUntil: 'load' });
  await tab.addStyleTag({ content: '.wk-teaser { display: none !important; }' });
  await expect(tab.locator(SIGNATURE.walk!).first()).not.toBeVisible();
  await context.close();
});

/**
 * No text in the first screen crosses the screen edge or runs into its
 * neighbour (8 Oct 2026: on a car, Poster's "128,000" and "06/2027" were set
 * at one size for every value, overlapped and ran off the phone — clipped by
 * the page, so no sideways scroll gave it away).
 */
test.describe('first-screen text stays on the phone and apart', () => {
  for (const { id, slug } of PAGES) {
    test(`${slug}-${id}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
      const tab = await context.newPage();
      await tab.goto(`${BASE}/template-check/${slug}-${id}/`, { waitUntil: 'load' });
      const problems = await tab.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out: string[] = [];
        const scrolls = (el: Element) => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
          }
          return false;
        };
        const texts = [...document.querySelectorAll('.stage :is(h1, dd, dt, b, strong, p)')].filter((el) => {
          if (!el.textContent?.trim() || el.closest('[aria-hidden="true"]') || scrolls(el)) return false;
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.top < 844 * 1.2;
        });
        for (const el of texts) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const box = range.getBoundingClientRect();
          if (box.left < -1 || box.right > vw + 1) out.push(`off screen: "${el.textContent!.trim().slice(0, 20)}"`);
        }
        // Siblings in one row of numbers must not overlap.
        for (const row of document.querySelectorAll('.stage dl')) {
          const values = [...row.querySelectorAll('dd')].map((dd) => {
            const range = document.createRange();
            range.selectNodeContents(dd);
            return { text: dd.textContent!.trim(), box: range.getBoundingClientRect() };
          });
          for (let i = 0; i < values.length; i += 1) {
            for (let j = i + 1; j < values.length; j += 1) {
              const a = values[i]!.box;
              const b = values[j]!.box;
              const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
              if (overlap) out.push(`overlap: "${values[i]!.text}" / "${values[j]!.text}"`);
            }
          }
        }
        return [...new Set(out)];
      });
      await context.close();
      expect(problems, `${id} on ${slug}`).toEqual([]);
    });
  }
});

test('gallery tiles keep their shape, whatever size the photograph is', async ({ page }) => {
  // 12 Oct 2026: the img height ATTRIBUTE beat the CSS aspect-ratio, so a
  // 1200x800 photograph made a tile 336px wide and 800px tall on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/template-check/R4LSH-aurora/`, { waitUntil: 'load' });
  const ratios = await page
    .locator('#listing-gallery .gallery-open img')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height / el.getBoundingClientRect().width));
  expect(ratios.length).toBeGreaterThan(1);
  for (const ratio of ratios) expect(ratio).toBeLessThanOrEqual(0.76);
});

/**
 * Below the first screen, every design is its own page (12 Oct 2026).
 *
 * The owner looked at the designs side by side and said they looked the
 * same, and below the cover they were: one heading, one facts grid, one
 * seller card, recoloured. Each design's stylesheet now restyles the shared
 * sections in its own idiom, and this keeps it that way: the section heading
 * and the facts grid, read as computed style, must differ for every pair.
 * One demo listing per category (a car-only design on a flat falls back to
 * another design), so a difference is the design's, not the data's.
 */
const bodyFingerprint = () => {
  const pick = (el: Element | null, props: string[]) => {
    if (!el) return 'none';
    const style = getComputedStyle(el);
    return props.map((prop) => style.getPropertyValue(prop)).join('|');
  };
  const h2 = document.querySelector('main section:not(.enrich) > h2');
  return [
    pick(h2, ['font-family', 'font-size', 'font-weight', 'color', 'text-align', 'border-block-end-style', 'background-color', 'padding-inline-start']),
    pick(document.querySelector('.facts'), ['display', 'grid-template-columns', 'row-gap', 'background-color', 'border-block-start-style']),
    pick(document.querySelector('.fact'), ['background-color', 'border-top-style', 'border-top-width', 'border-radius', 'font-family']),
  ];
};

test('no two designs share a page body', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const tab = await context.newPage();
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const id of CATALOGUE) {
    const slug = templateFits(id, 'property') ? 'A7K2M' : 'V3M9Q';
    await tab.goto(`${BASE}/template-check/${slug}-${id}/`, { waitUntil: 'load' });
    const [heading, grid, cell] = await tab.evaluate(bodyFingerprint);
    expect(heading, `${id}: no section heading below the first screen`).not.toBe('none');
    expect(grid, `${id}: no facts grid`).not.toBe('none');
    const key = `${heading}#${grid}#${cell}`;
    const twin = seen.get(key);
    if (twin) clashes.push(`${id} has the same page body as ${twin}`);
    seen.set(key, id);
  }
  await context.close();
  expect(clashes).toEqual([]);
});

test('the page-body check fires when two designs share a body', async ({ browser }) => {
  // Strip both pages back to the shared listing.css body and the check must
  // see them as one: two plain pages with no design sheet are identical.
  const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL', reducedMotion: 'reduce' });
  const tab = await context.newPage();
  const prints: string[][] = [];
  for (const id of ['aurora', 'monolith']) {
    await tab.goto(`${BASE}/template-check/A7K2M-${id}/`, { waitUntil: 'load' });
    await tab.evaluate(() => document.documentElement.setAttribute('data-template', 'none'));
    prints.push(await tab.evaluate(bodyFingerprint));
  }
  await context.close();
  expect(prints[0]).toEqual(prints[1]);
});
