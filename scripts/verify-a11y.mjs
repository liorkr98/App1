#!/usr/bin/env node
/**
 * Cheap accessibility gate on built HTML. No overlay widget, no new npm
 * dependency. Fails on missing skip link, missing #main, missing h1, or
 * lang/dir on the document.
 *
 * Pages: /, /new, /template-check/A7K2M, /template-check/walk
 *
 * Run after the web build: node scripts/verify-a11y.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST_ROOT = process.argv[2] ?? 'web/dist';

function findPage(...parts) {
  const candidates = [
    path.join(DIST_ROOT, ...parts, 'index.html'),
    path.join(DIST_ROOT, 'client', ...parts, 'index.html'),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

const pages = [
  ['homepage', findPage()],
  ['editor', findPage('new')],
  ['listing', findPage('template-check', 'A7K2M')],
  ['walk', findPage('template-check', 'walk')],
];

const problems = [];

for (const [label, file] of pages) {
  if (!file) {
    problems.push(`missing built HTML for ${label}`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (!/lang="he"/.test(html)) problems.push(`${label}: missing lang="he"`);
  if (!/dir="rtl"/.test(html)) problems.push(`${label}: missing dir="rtl"`);
  if (!/href="#main"/.test(html)) problems.push(`${label}: missing skip link to #main`);
  if (!/id="main"/.test(html)) problems.push(`${label}: missing #main`);
  const headings = html.match(/<h1\b/g) ?? [];
  if (headings.length !== 1) {
    problems.push(`${label}: expected one h1, found ${headings.length}`);
  }
}

const listingCss = fs.readFileSync(path.join(process.cwd(), 'web/src/styles/listing.css'), 'utf8');
if (!listingCss.includes('3.83:1')) {
  problems.push('listing.css: missing --olive-lift 3.83:1 contrast note');
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('a11y markup ok');
