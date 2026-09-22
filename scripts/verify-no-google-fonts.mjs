#!/usr/bin/env node
/**
 * Fails if a built listing page requests Google Fonts.
 *
 * A forwarded listing is a third-party connection under Amendment 13 if it
 * calls fonts.googleapis.com or fonts.gstatic.com. The faces are self-hosted
 * under /fonts. Homepage, editor and lab may still use the CDN; this scan
 * is listing HTML only (template-check + /a), same scope as the plate grep.
 *
 * Run after the web build: node scripts/verify-no-google-fonts.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';
const FORBIDDEN = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === 'index.html') acc.push(full);
  }
  return acc;
}

function listingPages(root) {
  const out = [];
  for (const folder of ['template-check', 'a']) {
    const dir = path.join(root, folder);
    if (fs.existsSync(dir)) out.push(...walk(dir));
  }
  const nested = path.join(root, 'client');
  if (fs.existsSync(nested) && nested !== root) out.push(...listingPages(nested));
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error(`No build output at ${DIST}. Run the web build first.`);
  process.exit(1);
}

const pages = listingPages(DIST);
if (pages.length === 0) {
  console.error(`No listing HTML under ${DIST}/{template-check,a}.`);
  process.exit(1);
}

const problems = [];

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  if (FORBIDDEN.test(html)) {
    problems.push(path.relative(DIST, file));
  }
}

if (problems.length > 0) {
  console.error('\nGoogle Fonts check FAILED. Listing pages still call the CDN:\n');
  problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}`));
  process.exit(1);
}

console.log(`OK: no Google Fonts request on ${pages.length} listing pages.`);
