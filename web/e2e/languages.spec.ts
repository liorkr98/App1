import { expect, test } from '@playwright/test';

/**
 * The listing page in English, Russian and Arabic (migration 0044), on the
 * prerendered fixtures: the same ListingPage /a/{slug}/{lang}/ renders.
 *
 * Hebrew may stay on the page only where it is the listing's own data — a
 * street, a name, a caption the agent wrote, a place from the map — or the
 * switcher's way back to עברית. Everything that is OUR copy must be in the
 * page's language; a label left in Hebrew is a key missing from a dictionary.
 */
const DATA = [
  'סלון ומטבח פתוחים',
  'מטבח עם אריחי משושה',
  'חדר רחצה',
  'תריסים ומרפסת בחזית',
  'תשריט הדירה',
  'פולקסווגן גולף לבן מהצד',
  'נועה כהן',
  'אמיר חדד',
  'כהן נכסים',
  'דיזנגוף, תל אביב־יפו',
  'רמת גן',
  'דיזנגוף סנטר',
  'גן ילדים ניצן',
  'שופרסל שלי',
  'תחנת השלום',
  'דיזנגוף/פרישמן',
  'בית ספר יסודי ארנון',
  'חטיבת ביניים עירוני ט׳',
  'סופר פארם',
  'גן מאיר',
  'קפה לנדוור',
  'תחנת דיזנגוף',
  'חניון מעלות',
  'עברית',
];
const HEBREW = /[֐-׿]/;

const PAGES = ['T4V7A-aurora', 'T4V7A-agency', 'T4V7A-heliograph', 'G7F2K-dossier'];
const LANGS = [
  { lang: 'en', dir: 'ltr' },
  { lang: 'ru', dir: 'ltr' },
  { lang: 'ar', dir: 'rtl' },
] as const;

for (const slug of PAGES) {
  for (const { lang, dir } of LANGS) {
    test(`${slug} in ${lang}: direction, language and no Hebrew copy`, async ({ page }) => {
      await page.goto(`/template-check/${slug}/${lang}/`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);

      const texts = await page.evaluate(() => {
        const found: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, noscript, template')) continue;
          const text = node.textContent?.trim();
          if (text) found.push(text);
        }
        for (const element of document.querySelectorAll('[alt], [aria-label], [title]')) {
          for (const name of ['alt', 'aria-label', 'title']) {
            const value = element.getAttribute(name);
            if (value) found.push(value);
          }
        }
        return found;
      });
      const left = texts
        .filter((text) => HEBREW.test(text))
        .filter((text) => HEBREW.test(DATA.reduce((rest, data) => rest.split(data).join(''), text)));
      expect(left).toEqual([]);
    });
  }
}

test('the switcher names every version and marks the one open', async ({ page }) => {
  await page.goto('/template-check/T4V7A-aurora/ru/');
  const nav = page.locator('nav.page-langs');
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Русский');
  await expect(nav.locator('a[hreflang="he"]')).toHaveAttribute('href', '/a/T4V7A/');
  await expect(nav.locator('a[hreflang="en"]')).toHaveAttribute('href', '/a/T4V7A/en/');
  await expect(nav.locator('a[hreflang="ar"]')).toHaveAttribute('href', '/a/T4V7A/ar/');
});

test('the Hebrew page is still Hebrew and right to left', async ({ page }) => {
  await page.goto('/template-check/T4V7A/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

for (const slug of PAGES) {
  for (const { lang } of LANGS) {
    test(`${slug} in ${lang} fits a phone without sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/template-check/${slug}/${lang}/`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
