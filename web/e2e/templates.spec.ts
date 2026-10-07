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
