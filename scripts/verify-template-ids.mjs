#!/usr/bin/env node
/**
 * Every TEMPLATE_IDS value has a Hebrew reference HTML file, a homepage
 * mini-screen, and an editor card. A new template without those three is a
 * redesign CI cannot police (DESIGN-CONTRACT §8 / PHOTO-TOUR).
 *
 * Run: node scripts/verify-template-ids.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const listingTs = fs.readFileSync(path.join(root, 'src/types/listing.ts'), 'utf8');
const match = listingTs.match(/export const TEMPLATE_IDS = \[([^\]]+)\]/);
if (!match) {
  console.error('Could not read TEMPLATE_IDS from src/types/listing.ts');
  process.exit(1);
}

const ids = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
if (ids.length === 0) {
  console.error('TEMPLATE_IDS was empty');
  process.exit(1);
}

const home = fs.readFileSync(path.join(root, 'web/src/pages/index.astro'), 'utf8');
const picker = fs.readFileSync(path.join(root, 'web/src/components/editor/TemplateStep.tsx'), 'utf8');
const problems = [];

for (const id of ids) {
  const file = path.join(root, `listing-page-${id}.html`);
  if (!fs.existsSync(file)) {
    problems.push(`missing reference HTML listing-page-${id}.html`);
  }
  if (!home.includes(id) && !home.includes('TEMPLATE_IDS')) {
    problems.push(`homepage does not mention ${id}`);
  }
}

if (!home.includes('TEMPLATE_IDS')) {
  problems.push('homepage mini-screens are not driven from TEMPLATE_IDS');
}
if (!picker.includes('TEMPLATE_IDS')) {
  problems.push('editor picker is not driven from TEMPLATE_IDS');
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`template ids ok (${ids.join(', ')})`);
