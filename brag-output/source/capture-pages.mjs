import { chromium } from 'playwright';
const out = new URL('../work/cap', import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'he-IL', reducedMotion: 'reduce' });
const ids = ['aurora','poster','monolith','zine','ticket','glass','blueprint','heliograph','walk','showroom','keytag','prints','dossier','atelier','streetsign','dashboard'];
for (const id of ids) {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:4321/templates/${id}/demo/`, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '.demo-bar{display:none!important}' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${id}-first.png` });
  await p.screenshot({ path: `${out}/${id}-full.png`, fullPage: true });
  await p.close();
}
const c = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await c.newPage();
await p.goto('http://localhost:4321/template-check/card/T4V7A-aurora/', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/card-aurora.png` });
await b.close();
