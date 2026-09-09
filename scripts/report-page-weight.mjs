#!/usr/bin/env node
/**
 * Reports the built weight of each page against the 900KB budget.
 *
 * HONEST SCOPE — this measures the DOCUMENT and its local assets: HTML, CSS,
 * JS, fonts and images served from our own origin. It does NOT include:
 *
 *   - images still pointed at a placeholder CDN in this stage
 *   - the Google Fonts stylesheet and font files
 *
 * So the number below is a floor, not the full page weight. The real figure
 * needs a deployed page with real photographs, measured in a browser. Quoting
 * this as "the page weight" would be a lie by omission.
 *
 * ATTRIBUTION — why this walks the import graph instead of summing dist/
 *
 * The first version totalled every .css and .js file in the build and added
 * that sum to every page, calling it "shared". That was true while the only
 * JS in the build was shared, and it silently stops being true the moment one
 * page has an island. A React editor at /new would have been added to the
 * reported weight of every listing page — pages that never request a byte of
 * it — and the reported number would have roughly doubled without any listing
 * page changing at all.
 *
 * A budget that reacts to a page you did not touch is a budget people learn
 * to ignore. So each page is now charged for what it actually references:
 * assets named in its HTML, plus everything those assets import, transitively.
 *
 * Assets reachable from no page are reported separately rather than dropped —
 * a bundle nobody loads is either dead output or a broken reference, and both
 * are worth seeing.
 *
 * Run: node scripts/report-page-weight.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist';
const BUDGET_BYTES = 900 * 1024;

if (!fs.existsSync(DIST)) {
  console.error(`No build output at ${DIST}. Run the web build first.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Local asset references in a built file.
 *
 * Deliberately a text scan and not a parser. The inputs are Vite's own output,
 * where every reference is a quoted literal path — `href="/_astro/x.css"` in
 * HTML, `import"/_astro/y.js"` or `"./y.js"` in a chunk. A real HTML and JS
 * parser would cost two dependencies to be right about the same strings.
 *
 * Absolute references (`/_astro/...`) resolve against the dist root; relative
 * ones against the referring file, which is how a chunk importing a sibling
 * chunk is written.
 */
const ASSET = /["'`(](\.{0,2}\/[^"'`)\s]+?\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico|json))["'`)]/g;

function referencesFrom(file) {
  const source = fs.readFileSync(file, 'utf8');
  const found = new Set();

  for (const match of source.matchAll(ASSET)) {
    const reference = match[1];
    // path.resolve on both branches, so every path in the sets below is
    // absolute. Mixing a relative "web/dist/x.js" with an absolute one makes
    // the orphan check compare strings that can never match, and every asset
    // looks unreferenced.
    const resolved = path.resolve(
      reference.startsWith('/')
        ? path.join(DIST, reference.slice(1))
        : path.resolve(path.dirname(file), reference),
    );

    // Anything resolving outside dist is a remote or absolute-origin URL that
    // happens to match the shape. Not ours, not counted.
    const relative = path.relative(DIST, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;

    found.add(resolved);
  }

  return found;
}

/** Every asset a page pulls in, following imports until nothing new appears. */
function assetsFor(page) {
  const seen = new Set();
  const queue = [...referencesFrom(page)];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    // Only text formats can reference anything further. Reading a WebP as
    // UTF-8 looking for import statements would be slow and meaningless.
    if (/\.(css|js|mjs|json|svg)$/.test(file)) {
      for (const next of referencesFrom(file)) {
        if (!seen.has(next)) queue.push(next);
      }
    }
  }

  return seen;
}

const all = walk(DIST);
const pages = all.filter((file) => file.endsWith('.html')).sort();

const size = (bytes) => (bytes / 1024).toFixed(1);
const totalOf = (files) => [...files].reduce((sum, file) => sum + fs.statSync(file).size, 0);

console.log('Built page weight (local assets only — remote images and fonts excluded)\n');

let over = 0;
const summary = [];
const attributed = new Set();

for (const page of pages) {
  const assets = assetsFor(page);
  for (const asset of assets) attributed.add(asset);

  const htmlBytes = fs.statSync(page).size;
  const assetBytes = totalOf(assets);
  const total = htmlBytes + assetBytes;

  const directory = path.relative(DIST, path.dirname(page)).split(path.sep).join('/');
  const route = path.basename(page) === 'index.html' ? `/${directory}${directory ? '/' : ''}` : `/${directory}/${path.basename(page)}`;

  const status = total > BUDGET_BYTES ? 'OVER BUDGET' : 'ok';
  if (total > BUDGET_BYTES) over += 1;

  console.log(
    `  ${route.padEnd(20)} html ${size(htmlBytes).padStart(7)} KB   ` +
      `assets ${size(assetBytes).padStart(7)} KB   ` +
      `total ${size(total).padStart(7)} KB   ${status}`,
  );
  summary.push(`${route} ${size(total)}KB ${status}`);
}

/**
 * Output no page references. Reported, never silently ignored: this is where
 * a dead bundle or a broken path shows up, and it is the check that keeps the
 * per-page attribution above honest.
 */
const orphans = all.filter(
  (file) => !attributed.has(path.resolve(file)) && !file.endsWith('.html') && /\.(css|js|mjs)$/.test(file),
);

if (orphans.length > 0) {
  console.log(`\n  referenced by no page (${size(totalOf(orphans))} KB):`);
  for (const orphan of orphans.sort()) {
    console.log(`    ${path.relative(DIST, orphan).split(path.sep).join('/')}  ${size(fs.statSync(orphan).size)} KB`);
  }
}

if (process.env.GITHUB_ACTIONS) {
  // One line, no newlines — a notice is truncated at the first one.
  const budget = `budget ${(BUDGET_BYTES / 1024).toFixed(0)}KB`;
  const orphaned = orphans.length > 0 ? ` | ${orphans.length} unreferenced bundle(s) ${size(totalOf(orphans))}KB` : '';
  console.log(`::notice title=Page weight::${summary.join(' | ')} | ${budget}${orphaned}`);
}

console.log(`\n  budget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB per page, enrichment included`);

if (over > 0) {
  console.error(`\n${over} page(s) over budget on local assets alone.`);
  process.exit(1);
}

console.log('\nLCP and Lighthouse cannot be measured here — they need a deployed page');
console.log('and a real browser on a throttled connection.');
