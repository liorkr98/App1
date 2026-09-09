#!/usr/bin/env node
/**
 * Reports the built weight of each listing page against the 900KB budget.
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
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = 'web/dist';
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

const all = walk(DIST);

/** Shared assets every page pays for: hashed CSS/JS bundles. */
const sharedBytes = all
  .filter((file) => /\.(css|js)$/.test(file))
  .reduce((total, file) => total + fs.statSync(file).size, 0);

const pages = all.filter((file) => file.endsWith('index.html'));

console.log('Built page weight (local assets only — remote images and fonts excluded)\n');
console.log(`  shared css/js across all pages: ${(sharedBytes / 1024).toFixed(1)} KB\n`);

let over = 0;

/**
 * Also emit the numbers as a GitHub Actions notice.
 *
 * The measured page weight is the ONE hard number this pipeline produces, and
 * it was landing only in a job log — which needs authentication to read, so it
 * was invisible to anyone reviewing a run from outside. Annotations are public
 * on a public repository, so this puts the number where it can actually be
 * checked against the budget.
 */
const summary = [];

for (const page of pages.sort()) {
  const htmlBytes = fs.statSync(page).size;
  const total = htmlBytes + sharedBytes;
  const route = `/${path.relative(DIST, path.dirname(page)).split(path.sep).join('/')}/`;
  const status = total > BUDGET_BYTES ? 'OVER BUDGET' : 'ok';
  if (total > BUDGET_BYTES) over += 1;
  console.log(
    `  ${route.padEnd(18)} html ${(htmlBytes / 1024).toFixed(1).padStart(7)} KB   ` +
      `total ${(total / 1024).toFixed(1).padStart(7)} KB   ${status}`,
  );
  summary.push(`${route} html ${(htmlBytes / 1024).toFixed(1)}KB total ${(total / 1024).toFixed(1)}KB ${status}`);
}

if (process.env.GITHUB_ACTIONS) {
  // One line, no newlines — a notice is truncated at the first one.
  const shared = `shared ${(sharedBytes / 1024).toFixed(1)}KB`;
  const budget = `budget ${(BUDGET_BYTES / 1024).toFixed(0)}KB`;
  console.log(`::notice title=Page weight::${shared} | ${summary.join(' | ')} | ${budget}`);
}

console.log(`\n  budget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB total, enrichment included`);

if (over > 0) {
  console.error(`\n${over} page(s) over budget on local assets alone.`);
  process.exit(1);
}

console.log('\nLCP and Lighthouse cannot be measured here — they need a deployed page');
console.log('and a real browser on a throttled connection.');
