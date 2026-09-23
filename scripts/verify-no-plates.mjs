#!/usr/bin/env node
/**
 * Fails if a built listing page publishes a licence plate.
 *
 * CLAUDE.md §7 / §12: the plate is a lookup key only. A public page that
 * pairs a plate with a location is a theft and cloning risk. Nothing on
 * Listing stores one, but a caption, a description, or JSON-LD can still
 * leak a dashed Israeli number if someone pastes it.
 *
 * Scans listing HTML only (template-check + /a). The editor is allowed to
 * show the plate the seller just typed.
 *
 * Run after the web build: node scripts/verify-no-plates.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';

/** 12-345-67 (7 digits) or 123-45-678 (8 digits). Phones are 3-3-4 / 2-7. */
const DASHED_PLATE = /(?<!\d)(?:\d{2}-\d{3}-\d{2}|\d{3}-\d{2}-\d{3})(?!\d)/g;
const LABELLED = /מספר רישוי\s*[:\u05BE-]?\s*\d/;

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
  // Cloudflare adapter may nest under client/
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
  const rel = path.relative(DIST, file);

  DASHED_PLATE.lastIndex = 0;
  const dashed = html.match(DASHED_PLATE);
  if (dashed) {
    problems.push(`${rel}: published plate-shaped number (${[...new Set(dashed)].join(', ')})`);
  }
  if (LABELLED.test(html)) {
    problems.push(`${rel}: "מספר רישוי" followed by digits`);
  }
}

if (problems.length > 0) {
  console.error('\nPlate leak check FAILED:\n');
  problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}`));
  process.exit(1);
}

console.log(`OK: no licence plate on ${pages.length} listing pages.`);
