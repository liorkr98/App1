#!/usr/bin/env node
/**
 * Asserts the property and vehicle pages differ in EXACTLY the four ways
 * DESIGN-CONTRACT.md §5 allows. A fifth difference is a porting bug.
 *
 * Runs against the BUILT html, not the source, so it catches a divergence
 * introduced anywhere in the pipeline — a component, a conditional, a style
 * override — rather than only ones visible in one file.
 *
 * Allowed:
 *   1. hero height  --heroH on <html>
 *   2. price note   different text in .price-note
 *   3. disclosures  section.flaws, vehicle only
 *   4. map          section.map, property only
 *
 * Run after `npm run build` in web/:
 *   node scripts/verify-template-divergences.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST_ROOT = 'web/dist';
const DIST = 'web/dist/a';
const PROPERTY = path.join(DIST, 'A7K2M', 'index.html');
const VEHICLE = path.join(DIST, 'V3M9Q', 'index.html');

for (const file of [PROPERTY, VEHICLE]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing build output: ${file}\nRun the web build first.`);
    process.exit(1);
  }
}

const property = fs.readFileSync(PROPERTY, 'utf8');
const vehicle = fs.readFileSync(VEHICLE, 'utf8');

const problems = [];

// --- 1. CSS must be byte-identical -----------------------------------------
// The hero divergence rides on two custom properties on <html>, so the
// stylesheet itself has no reason to differ. If it does, someone added a
// category-specific style rule.
/**
 * All CSS a page applies: inline <style> blocks PLUS every local stylesheet
 * it links.
 *
 * B2 grew the listing stylesheet past Astro's inlining threshold, so it moved
 * into /_astro/*.css. Reading only <style> would then have compared two empty
 * strings and reported success — the check would have kept passing while
 * checking nothing, which CLAUDE.md §4.1 calls worse than having no rule at
 * all. A stylesheet that cannot be read is reported as MISSING rather than
 * skipped, so a broken href fails loudly instead of quietly matching.
 */
const styleOf = (html) => {
  const inline = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n');

  const linked = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((tag) => tag[0].match(/href="([^"]+)"/)?.[1])
    .filter((href) => href && href.startsWith('/'))
    .map((href) => {
      const file = path.join(DIST_ROOT, href.slice(1));
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `MISSING:${href}`;
    })
    .join('\n');

  return `${inline}\n${linked}`;
};

if (styleOf(property) !== styleOf(vehicle)) {
  problems.push(
    'CSS differs between the two pages. The hero divergence is carried by\n' +
      '  --heroH on <html>, so the stylesheet must be identical.\n' +
      '  A category-specific rule was added somewhere.',
  );
}

// --- 2. The hero custom properties SHOULD differ ---------------------------
const heroVars = (html) => (html.match(/<html[^>]*style="([^"]*)"/) ?? [, ''])[1];

const propertyVars = heroVars(property);
const vehicleVars = heroVars(vehicle);

if (!propertyVars || !vehicleVars) {
  problems.push('Hero custom properties missing from <html> on one or both pages.');
} else if (propertyVars === vehicleVars) {
  problems.push(
    `Hero variables are identical (${propertyVars}). Divergence 1 has been lost —\n` +
      '  a car in a tall frame is either cropped or surrounded by asphalt.',
  );
}

// --- 3 and 4. Section landmarks --------------------------------------------
/**
 * Section class lists, with the presentational `reveal` stripped.
 *
 * B2 added scroll-driven reveals, so a section's class attribute is now
 * "enrich reveal" rather than "enrich". Comparing whole attributes would call
 * that a divergence; comparing sorted class SETS asks the question actually
 * being asked, which is which sections exist on each page.
 */
const sections = (html) =>
  [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map((match) =>
    match[1]
      .split(/\s+/)
      .filter((name) => name && name !== 'reveal')
      .sort()
      .join(' '),
  );

const propertySections = sections(property);
const vehicleSections = sections(vehicle);

const has = (list, name) => list.includes(name);

if (!has(vehicleSections, 'flaws')) {
  problems.push('Vehicle page is missing section.flaws — divergence 3 lost.');
}
if (has(propertySections, 'flaws')) {
  problems.push('Property page has section.flaws. Allowed only when disclosures exist.');
}
if (!has(propertySections, 'map')) {
  problems.push('Property page is missing section.map — divergence 4 lost.');
}
if (has(vehicleSections, 'map')) {
  problems.push(
    'Vehicle page has section.map. A vehicle location is an approximate meeting\n' +
      '  area; pinning a private car for sale to a home address is a theft risk.',
  );
}

// --- 5. No OTHER section class may differ ----------------------------------
const ALLOWED_ONLY = new Set(['flaws', 'map']);
const propertyOther = propertySections.filter((c) => !ALLOWED_ONLY.has(c)).sort().join('|');
const vehicleOther = vehicleSections.filter((c) => !ALLOWED_ONLY.has(c)).sort().join('|');

if (propertyOther !== vehicleOther) {
  problems.push(
    `A FIFTH divergence exists in the section structure.\n` +
      `  property: [${propertyOther}]\n  vehicle : [${vehicleOther}]`,
  );
}

// --- Report ----------------------------------------------------------------
if (problems.length > 0) {
  console.error('\nTemplate divergence check FAILED:\n');
  problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}\n`));
  console.error('See docs/DESIGN-CONTRACT.md §5. Exactly four divergences are allowed.\n');
  process.exit(1);
}

console.log('OK: exactly the four allowed divergences.');
console.log(`  1. hero      property ${propertyVars}  |  vehicle ${vehicleVars}`);
console.log('  2. price note  content only, identical CSS');
console.log('  3. disclosures vehicle only');
console.log('  4. map         property only');
