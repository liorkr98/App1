// Renders compose.html frame by frame. Usage:
//   node render.mjs stills 0.3 1.6 ...   → work/stills/t-<s>.png
//   node render.mjs frames [from to]     → work/frames/%05d.png (seconds; default: all)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [mode = 'frames', ...rest] = process.argv.slice(2);
const work = new URL('../work/', import.meta.url).pathname;
const FPS = 30;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
await p.evaluate(() => window.ready);
const stage = p.locator('#stage');
if (mode === 'stills') {
  mkdirSync(work + 'stills', { recursive: true });
  for (const s of rest) {
    await p.evaluate((t) => window.render(t), Number(s));
    await stage.screenshot({ path: `${work}stills/t-${s}.png` });
  }
} else {
  mkdirSync(work + 'frames', { recursive: true });
  const total = Math.round((await p.evaluate(() => window.DURATION)) * FPS);
  const [from = 0, to = total / FPS] = rest.map(Number);
  for (let i = Math.round(from * FPS); i < Math.min(total, Math.round(to * FPS)); i++) {
    await p.evaluate((t) => window.render(t), i / FPS);
    await stage.screenshot({ path: `${work}frames/${String(i).padStart(5, '0')}.png` });
    if (i % 60 === 0) console.log(`${i}/${total}`);
  }
}
await b.close();
