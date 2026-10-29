import { expect, test } from '@playwright/test';

import { BASE } from './measure';

/**
 * Copy per page (19 Oct 2026): the dashboard's, the admin's, sign-in's, the
 * phone upload's and the contact form's copy no longer ships in the shared
 * he.json; each page loads its own (web/src/lib/copy). A page that forgot
 * would show its keys — `dash.title` — to a person. Each page here, after its
 * scripts have run, shows words and no key.
 */
const KEY = /\b(dash|admin|auth|phoneUpload|legal)\.[a-zA-Z]+/;

for (const route of ['/mine/', '/me/', '/enter/', '/up/', '/admin/', '/contact/', '/new/']) {
  test(`${route} shows its copy, not its keys`, async ({ page }) => {
    await page.goto(`${BASE}${route}`);
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').innerText();
    expect(text.match(KEY)?.[0], `a key on ${route}`).toBeUndefined();
  });
}
