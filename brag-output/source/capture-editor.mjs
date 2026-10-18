// Drives the real editor at /new against a local static build (no backend)
// and screenshots each state the ad shows. Run with the site served on :4321.
import { chromium } from 'playwright';
const out = new URL('../work/cap/', import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'he-IL', reducedMotion: 'reduce' });
const p = await ctx.newPage();
// Upload state badges only exist because there is no backend offline.
const hide = () => p.addStyleTag({ content: '.shot-state{display:none!important}' });
await p.goto('http://localhost:4321/new/?fresh=1', { waitUntil: 'networkidle' });
await hide();
await p.waitForTimeout(800);
await p.getByText('הבנתי').click().catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}e01-start.png` });
await p.getByText('דירה', { exact: true }).first().click();
const dir = new URL('../../web/public/fixtures/', import.meta.url).pathname;
await p.locator('input[type=file]').first().setInputFiles(['tlv-living', 'tlv-kitchen', 'tlv-balcony', 'tlv-bath'].map((n) => `${dir}${n}-1200.webp`));
await p.waitForTimeout(3000);
await p.getByText('הבנתי').click().catch(() => {});
await p.getByText('סידור מומלץ').scrollIntoViewIfNeeded();
await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('סידור מומלץ')); window.scrollBy(0, el.getBoundingClientRect().top - 90); });
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}e02-photos.png` });
await p.evaluate(() => window.scrollBy(0, 330));
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}e03-checklist.png` });
await p.getByText('הבא: הפרטים').click();
await p.waitForTimeout(800);
await p.getByText('הבנתי').click().catch(() => {});
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}e04-details.png` });
let n = 5;
const fill = async (label, v) => {
  const f = p.getByLabel(label, { exact: true });
  for (let i = 1; i <= v.length; i += Math.max(1, Math.ceil(v.length / 3))) {
    await f.fill(v.slice(0, i));
  }
  await f.fill(v);
  await f.blur();
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${out}e${String(n++).padStart(2, '0')}-fill.png` });
};
await fill('עיר', 'תל אביב־יפו');
await fill('רחוב ומספר', 'דיזנגוף');
await fill('מחיר', '4250000');
await p.evaluate(() => window.scrollBy(0, 260));
await fill('חדרים', '4');
await fill('מ״ר', '108');
await fill('קומה', '5');
await p.getByText('הבא: לראות את המודעה').click();
await p.waitForTimeout(1500);
await p.getByText('הבנתי').click().catch(() => {});
await p.evaluate(() => window.scrollTo(0, 0));
// The preview is an iframe of the draft; give it time to paint.
for (const f of p.frames()) await f.waitForLoadState('networkidle').catch(() => {});
await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}e20-ready.png` });
await p.getByText('בחרנו בשבילכם').scrollIntoViewIfNeeded().catch(() => {});
await p.evaluate(() => window.scrollBy(0, 200));
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}e21-design.png` });
await b.close();
