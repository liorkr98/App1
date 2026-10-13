import { expect, test, type Page } from '@playwright/test';

import { CATALOGUE } from '@/features/templates/manifest';

/**
 * The example links a visitor taps actually open (13 Oct 2026).
 *
 * The homepage linked every template example into /template-check/, a CI
 * fixture that .assetsignore keeps out of the deploy. Here the files exist,
 * so every check passed while the live site answered "page not found".
 * This spec asserts what the deploy needs: no public page links into a
 * fixture path, and every link resolves. scripts/verify-public-links.mjs
 * checks the same against .assetsignore for every built page.
 */
const FIXTURE_PATHS = ['/template-check/'];

/** Same-site links on the page that lead into a path the deploy leaves out. */
export const fixtureLinks = (hrefs: string[]) =>
  hrefs.filter((href) => FIXTURE_PATHS.some((prefix) => href.startsWith(prefix)));

const sameSiteLinks = async (page: Page) =>
  (await page.locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? '')))
    .filter((href) => !href.startsWith('//'));

test('the fixture rule fires on a planted /template-check/ link', () => {
  expect(fixtureLinks(['/templates/aurora/demo/', '/template-check/T4V7A-aurora/'])).toEqual([
    '/template-check/T4V7A-aurora/',
  ]);
});

for (const path of ['/', '/templates/', `/templates/${CATALOGUE[0]}/`, '/agents/', '/dealers/', '/private/']) {
  test(`${path}: no link into a fixture, and every link opens`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = [...new Set(await sameSiteLinks(page))];
    expect(fixtureLinks(hrefs)).toEqual([]);
    for (const href of hrefs.filter((h) => !h.startsWith('/a/') && !h.startsWith('#'))) {
      const response = await request.get(href.split('#')[0]!, { maxRedirects: 0 });
      expect(response.status(), href).toBeLessThan(400);
    }
  });
}

test('the homepage template row opens each live example', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('.hm-device').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.length).toBe(CATALOGUE.length);
  for (const href of hrefs) expect(href).toMatch(/^\/templates\/[a-z]+\/demo\/$/);
});

for (const id of CATALOGUE) {
  test(`/templates/${id}/demo/ draws ${id} under the demo bar, noindex`, async ({ page }) => {
    await page.goto(`/templates/${id}/demo/`);
    await expect(page.locator('html')).toHaveAttribute('data-template', id);
    await expect(page.locator('.demo-bar')).toBeVisible();
    await expect(page.locator('.demo-bar-go')).toHaveAttribute('href', `/new/?fresh=1&template=${id}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
}

test('the editor takes ?template= once and drops it from the address', async ({ page }) => {
  await page.goto('/new/?fresh=1&template=heliograph');
  await expect(page).toHaveURL(/\/new\/$/);
});
