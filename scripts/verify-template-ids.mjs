#!/usr/bin/env node
/**
 * Every TEMPLATE_IDS value has a Hebrew reference HTML file, a homepage
 * mini-screen, and an editor card. Every Living Surfaces template (an `ls`
 * entry in the manifest) also has the homepage's screenshot of its first
 * screen, web/public/home/templates/{id}.webp — the row links to the live
 * page, and a missing picture is a hole in the catalogue. The editor offers
 * the manifest's CATALOGUE, and each of its ids must be a drawn template. A new template without those three is a
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

const manifest = fs.readFileSync(path.join(root, 'src/features/templates/manifest.ts'), 'utf8');
const livingSurfaces = new Set(
  [...manifest.matchAll(/^\s+(\w+): \{[^}]*\bls: '/gm)].map((item) => item[1]),
);
if (livingSurfaces.size === 0) {
  console.error('Could not read any ls templates from the manifest');
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
  const tokens = path.join(root, 'web/src/styles/templates', `${id}.css`);
  if (!fs.existsSync(tokens)) {
    problems.push(`missing template token set web/src/styles/templates/${id}.css`);
  }
  if (livingSurfaces.has(id)) {
    const poster = path.join(root, 'web/public/home/templates', `${id}.webp`);
    if (!fs.existsSync(poster)) {
      problems.push(`missing homepage screenshot web/public/home/templates/${id}.webp`);
    }
  }
  if (!home.includes(id) && !home.includes('TEMPLATE_IDS')) {
    problems.push(`homepage does not mention ${id}`);
  }
}

if (!home.includes('TEMPLATE_IDS')) {
  problems.push('homepage mini-screens are not driven from TEMPLATE_IDS');
}
/*
 * The picker offers the CATALOGUE (manifest.ts, 6 Oct 2026), not every id:
 * the 1.x skins stay valid for old rows but are no longer offered. So the
 * picker must be driven by pickerTemplates, and every catalogue entry must
 * be a real id with its own Living Surfaces entry — a catalogue that names
 * an id the manifest does not draw would offer a card that renders nothing.
 */
if (!picker.includes('pickerTemplates')) {
  problems.push('editor picker is not driven from the manifest catalogue (pickerTemplates)');
}
const catalogue = manifest.match(/export const CATALOGUE: readonly TemplateId\[\] = \[([^\]]+)\]/);
if (!catalogue) {
  problems.push('could not read CATALOGUE from src/features/templates/manifest.ts');
} else {
  for (const id of [...catalogue[1].matchAll(/'([^']+)'/g)].map((m) => m[1])) {
    if (!ids.includes(id)) problems.push(`catalogue names ${id}, which is not in TEMPLATE_IDS`);
    if (!new RegExp(`\\b${id}: \\{[^}]*ls: '`).test(manifest)) {
      problems.push(`catalogue names ${id}, which has no Living Surfaces entry in the manifest`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`template ids ok (${ids.join(', ')})`);
